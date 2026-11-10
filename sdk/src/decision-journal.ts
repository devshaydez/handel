import { createHash } from "node:crypto";

export interface DecisionRecordInput {
  decisionId: string;
  schemaVersion: 1;
  createdAt: string;
  accountRef: string;
  agentVersion: string;
  modelId: string;
  authorityMode: string;
  permissionSnapshotHash: string;
  action: string;
  assetId: string;
  optionTerms: { strike: string; quantity: string; expiryNs: string; premium: string };
  marketEvidence: { source: string; observedAt: string; verificationMethod: string; evidenceHash: string; snapshotHash: string; evidenceType: "execution_oracle" | "signed_execution_quote"; executionEligible: true };
  premiumEvidence: { source: string; calculatedAt: string; methodology: string; evidenceHash: string; verificationMethod: string };
  guardrailEvidence: { decisionId: string; outcome: string; confidence: number; signatureKind: string };
  rationale: string;
  risks: string[];
  alternativesEvaluated: string[];
  uncertainty: string[];
  policy: { ok: boolean; errors: string[]; warnings: string[] };
  approvalState: string;
  executionState: "proposed" | "rejected" | "awaiting_approval" | "approved" | "submitted" | "pending" | "outcome_unknown" | "failed" | "confirmed" | "settled";
}
export interface DecisionRecord extends DecisionRecordInput {
  previousHash: string;
  recordHash: string;
}
export interface DecisionSnapshotStore {
  load(): Promise<DecisionRecord[] | null>;
  save(records: DecisionRecord[]): Promise<void>;
}
export interface DecisionRecorder {
  record(input: DecisionRecordInput): Promise<DecisionRecord>;
  list(): DecisionRecord[];
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  const object = value as Record<string, unknown>;
  return "{" + Object.keys(object).sort().map(key => JSON.stringify(key) + ":" + canonical(object[key])).join(",") + "}";
}
function digest(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}
function validateInput(input: DecisionRecordInput): void {
  for (const [key, value] of Object.entries({
    decisionId: input.decisionId, createdAt: input.createdAt, accountRef: input.accountRef,
    agentVersion: input.agentVersion, modelId: input.modelId, authorityMode: input.authorityMode,
    permissionSnapshotHash: input.permissionSnapshotHash, action: input.action, assetId: input.assetId,
    rationale: input.rationale, approvalState: input.approvalState,
  })) {
    if (typeof value !== "string" || !value.trim() || value.length > 4096) throw new Error("Invalid decision field: " + key);
  }
  if (input.schemaVersion !== 1 || !Number.isFinite(Date.parse(input.createdAt))) throw new Error("Invalid decision schema or timestamp");
  if (!/^\d+$/.test(input.optionTerms.strike) || !/^\d+$/.test(input.optionTerms.quantity) ||
      !/^\d+$/.test(input.optionTerms.expiryNs) || !/^\d+$/.test(input.optionTerms.premium)) throw new Error("Invalid option terms in decision record");
  if (!input.marketEvidence.source || !input.marketEvidence.observedAt || !input.marketEvidence.verificationMethod ||
      input.marketEvidence.executionEligible !== true ||
      !["execution_oracle", "signed_execution_quote"].includes(input.marketEvidence.evidenceType) ||
      !/^[a-f0-9]{64}$/.test(input.marketEvidence.evidenceHash) || !/^[a-f0-9]{64}$/.test(input.marketEvidence.snapshotHash) ||
      !input.premiumEvidence.source || !input.premiumEvidence.calculatedAt || !input.premiumEvidence.methodology ||
      !/^[a-f0-9]{64}$/.test(input.premiumEvidence.evidenceHash) || !input.premiumEvidence.verificationMethod) {
    throw new Error("Decision record is missing market or premium provenance");
  }
  if (!input.guardrailEvidence.decisionId || input.guardrailEvidence.outcome !== "allow" ||
      !["provider_tee", "gateway"].includes(input.guardrailEvidence.signatureKind) ||
      !Number.isFinite(input.guardrailEvidence.confidence) || input.guardrailEvidence.confidence < 0 ||
      input.guardrailEvidence.confidence > 1) throw new Error("Decision record has unverified guardrail evidence");
  if (!Array.isArray(input.risks) || !Array.isArray(input.alternativesEvaluated) ||
      !Array.isArray(input.uncertainty) || !input.policy || typeof input.policy.ok !== "boolean") {
    throw new Error("Decision record has invalid evidence arrays or policy result");
  }
}

/** Append-only, hash-chained decision journal. The host supplies durable storage. */
export class DecisionJournal implements DecisionRecorder {
  private records: DecisionRecord[];
  private tail: Promise<void> = Promise.resolve();

  private constructor(private store: DecisionSnapshotStore, records: DecisionRecord[]) {
    this.records = records;
  }

  static async open(store: DecisionSnapshotStore): Promise<DecisionJournal> {
    const records = (await store.load()) ?? [];
    let previousHash = "GENESIS";
    const seen = new Set<string>();
    for (const record of records) {
      const { recordHash, ...unsigned } = record;
      if (seen.has(record.decisionId) || record.previousHash !== previousHash ||
          digest(unsigned) !== recordHash) throw new Error("Decision journal integrity verification failed");
      seen.add(record.decisionId);
      previousHash = recordHash;
    }
    return new DecisionJournal(store, records.map(record => structuredClone(record)));
  }

  async record(input: DecisionRecordInput): Promise<DecisionRecord> {
    validateInput(input);
    let release!: () => void;
    const previous = this.tail;
    this.tail = new Promise<void>(resolve => { release = resolve; });
    await previous;
    const before = this.records;
    try {
      if (this.records.some(record => record.decisionId === input.decisionId)) throw new Error("Duplicate decision ID");
      const unsigned = { ...structuredClone(input), previousHash: this.records.at(-1)?.recordHash ?? "GENESIS" };
      const record: DecisionRecord = { ...unsigned, recordHash: digest(unsigned) };
      const next = [...this.records, record];
      await this.store.save(next);
      this.records = next;
      return structuredClone(record);
    } catch (error) {
      this.records = before;
      throw error;
    } finally {
      release();
    }
  }

  list(): DecisionRecord[] {
    return this.records.map(record => structuredClone(record));
  }

  explain(decisionId: string): string {
    const record = this.records.find(item => item.decisionId === decisionId);
    if (!record) throw new Error("Decision record not found");
    return [
      `Decision ${record.decisionId}: ${record.action} proposal for ${record.assetId}.`,
      `Rationale: ${record.rationale}`,
      `Market evidence: ${record.marketEvidence.source} observed at ${record.marketEvidence.observedAt}.`,
      `Premium: ${record.optionTerms.premium} (calculated by ${record.premiumEvidence.source}: ${record.premiumEvidence.methodology}; verified via ${record.premiumEvidence.verificationMethod}, evidence ${record.premiumEvidence.evidenceHash}).`,
      `Risks: ${record.risks.join("; ") || "No risks were supplied in the proposal."}`,
      `Policy: ${record.policy.ok ? "passed" : "rejected"}.`,
      `Guardrail: ${record.guardrailEvidence.outcome} with confidence ${record.guardrailEvidence.confidence}; verified as ${record.guardrailEvidence.signatureKind}.`,
      `Approval: ${record.approvalState}. Execution: ${record.executionState}.`,
      `Alternatives evaluated: ${record.alternativesEvaluated.join("; ") || "None recorded; do not infer that alternatives were evaluated."}`,
      `Uncertainty: ${record.uncertainty.join("; ") || "No explicit uncertainty was supplied."}`,
    ].join("\n");
  }
}
