import test from "node:test";
import assert from "node:assert/strict";
import { DecisionJournal, type DecisionRecord, type DecisionSnapshotStore } from "./decision-journal.js";

class MemoryStore implements DecisionSnapshotStore {
  value: DecisionRecord[] | null = null;
  async load() { return this.value; }
  async save(records: DecisionRecord[]) { this.value = structuredClone(records); }
}
const input = {
  decisionId: "decision-1", schemaVersion: 1 as const, createdAt: new Date().toISOString(),
  accountRef: "owner.near", agentVersion: "handel-agent-v1", modelId: "model-x",
  authorityMode: "permission-snapshot-only", permissionSnapshotHash: "abc",
  action: "Call", assetId: "ondo:nvda",
  optionTerms: { strike: "100000000", quantity: "1000000000000000000", expiryNs: "999999999999999999", premium: "5000000" },
  marketEvidence: { source: "approved-feed", observedAt: new Date().toISOString(), verificationMethod: "fixture", evidenceHash: "evidence-hash", snapshotHash: "market-hash" },
  premiumEvidence: { source: "pricing-v1", calculatedAt: new Date().toISOString(), methodology: "test" },
  guardrailEvidence: { decisionId: "guard-1", outcome: "allow", confidence: 0.99, signatureKind: "provider_tee" },
  rationale: "Fixture rationale", risks: ["price risk"], alternativesEvaluated: [], uncertainty: ["volatility unknown"],
  policy: { ok: true, errors: [], warnings: [] }, approvalState: "not-requested-at-proposal-stage",
  executionState: "proposed" as const,
};
test("persists hash-chained records and generates explanation from the stored record", async () => {
  const store = new MemoryStore();
  const journal = await DecisionJournal.open(store);
  const first = await journal.record(input);
  const second = await journal.record({ ...input, decisionId: "decision-2" });
  assert.equal(second.previousHash, first.recordHash);
  assert.match(journal.explain("decision-1"), /Fixture rationale/);
  const reopened = await DecisionJournal.open(store);
  assert.equal(reopened.list().length, 2);
});
test("detects altered records and broken chain on reopen", async () => {
  const store = new MemoryStore();
  const journal = await DecisionJournal.open(store);
  await journal.record(input);
  store.value![0].rationale = "tampered";
  await assert.rejects(() => DecisionJournal.open(store), /integrity verification failed/);
});
test("accepts verified provider-TEE or Gateway receipts and rejects unknown signature kinds", async () => {
  const journal = await DecisionJournal.open(new MemoryStore());
  await journal.record({ ...input, guardrailEvidence: { ...input.guardrailEvidence, signatureKind: "gateway" } });
  await assert.rejects(() => journal.record({
    ...input, decisionId: "decision-unknown",
    guardrailEvidence: { ...input.guardrailEvidence, signatureKind: "unsigned" },
  }), /unverified guardrail evidence/);
  await journal.record({ ...input, decisionId: "decision-tee" });
  await assert.rejects(() => journal.record({ ...input, decisionId: "decision-tee" }), /Duplicate decision ID/);
});
