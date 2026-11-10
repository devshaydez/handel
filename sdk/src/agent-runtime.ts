import { createHash, randomUUID } from "node:crypto";
import type { AgentPermission, AgentProposal, OptionType } from "./types.js";
import { validateProposal } from "./policy.js";
import { validateMarketSnapshot, type MarketSnapshot } from "./market-context.js";
import type { DecisionRecorder } from "./decision-journal.js";

export interface ProposalProvider {
  propose(x: unknown): Promise<{ proposal: AgentProposal; requestId?: string; verification?: unknown; usage?: unknown }>;
}
export interface PremiumQuote {
  premium: string; source: string; calculatedAt: string; methodology: string;
  evidenceHash: string; verificationMethod: string;
}
export interface PremiumEngine {
  quote(x: { type: OptionType; assetId: string; quantity: string; strike: string; expiryNs: string; market: MarketSnapshot }): Promise<PremiumQuote> | PremiumQuote;
}
export type MarketEvidenceType = "execution_oracle" | "signed_execution_quote" | "display_only" | "soft_quote" | "historical";
export interface MarketEvidenceVerifier {
  verify(snapshot: MarketSnapshot): Promise<{
    approved: boolean;
    executionEligible: boolean;
    evidenceType: MarketEvidenceType;
    method: string;
    evidenceHash: string;
  }>;
}
export interface ProposalGuardrail {
  evaluate(state: unknown): Promise<{
    allowed: boolean; outcome: "allow" | "block" | "review"; confidence: number;
    decisionId: string; signatureKind: "provider_tee" | "gateway";
  }>;
}
export interface AgentRequest {
  type: OptionType; assetId: string; quantity: string; strike: string; expiryNs: string; objective: string;
}
export class AgentRuntimeError extends Error {
  constructor(message: string, readonly code: string) { super(message); this.name = "AgentRuntimeError"; }
}

/** Trading proposals fail closed unless market evidence, signed System One guardrails, and durable decisions are verified. */
export class HandelAgentRuntime {
  constructor(
    private provider: ProposalProvider,
    private pricing: PremiumEngine,
    private guardrail: ProposalGuardrail,
    private decisions: DecisionRecorder,
    private marketVerifier: MarketEvidenceVerifier,
  ) {}

  async propose(r: AgentRequest, p: AgentPermission, s: MarketSnapshot) {
    if (!p?.enabled) throw new AgentRuntimeError("agent revoked", "AGENT_REVOKED");
    if (!p.allowedAssets.includes(r.assetId)) throw new AgentRuntimeError("asset not allowlisted", "ASSET_NOT_ALLOWED");
    const market = validateMarketSnapshot(s, r.assetId);
    let marketVerification;
    try { marketVerification = await this.marketVerifier.verify(market); }
    catch { throw new AgentRuntimeError("market source verification unavailable", "MARKET_SOURCE_UNVERIFIED"); }
    const evidenceType = marketVerification.evidenceType;
    if (!marketVerification.approved || !marketVerification.executionEligible ||
        (evidenceType !== "execution_oracle" && evidenceType !== "signed_execution_quote") ||
        !marketVerification.method.trim() || !/^[a-f0-9]{64}$/.test(marketVerification.evidenceHash)) {
      throw new AgentRuntimeError("market source is not approved for trading", "MARKET_SOURCE_UNVERIFIED");
    }
    const g = await this.provider.propose({
      task: "handel_european_option", objective: r.objective, requestedTerms: r,
      marketContext: market, marketVerification,
      instructions: "Do not invent premium or market data; host replaces premium with deterministic quote.",
    });
    const c = g.proposal;
    if (c.type !== r.type || c.underlyingAssetId !== r.assetId || c.quantity !== r.quantity ||
        c.strike !== r.strike || c.expiryNs !== r.expiryNs) {
      throw new AgentRuntimeError("model changed requested terms", "TERMS_MISMATCH");
    }
    const q = await this.pricing.quote({
      type: r.type, assetId: r.assetId, quantity: r.quantity, strike: r.strike,
      expiryNs: r.expiryNs, market,
    });
    const calculatedAt = Date.parse(q.calculatedAt);
    if (!/^\d+$/.test(q.premium) || BigInt(q.premium) <= 0n || !q.source.trim() || !q.methodology.trim() ||
        !/^[a-f0-9]{64}$/.test(q.evidenceHash) || !q.verificationMethod.trim() ||
        !Number.isFinite(calculatedAt) || calculatedAt > Date.now() + 30_000 || Date.now() - calculatedAt > 60_000) {
      throw new AgentRuntimeError("invalid deterministic premium quote", "INVALID_PREMIUM_QUOTE");
    }
    const proposal = { ...c, premium: q.premium, dataFreshness: market.observedAt };
    const policy = validateProposal(proposal, p, { requireAgent: true, requireFreshMarketData: true });
    if (!policy.ok) throw new AgentRuntimeError(policy.errors.join("; "), "POLICY_REJECTED");
    let guard;
    try {
      guard = await this.guardrail.evaluate({
        task: "handel_trade_proposal_guard", request: r, proposal, marketContext: market,
        marketVerification, deterministicPremium: q, policyDecision: policy,
      });
    } catch {
      throw new AgentRuntimeError("System One guardrail unavailable or unverified", "GUARDRAIL_UNAVAILABLE");
    }
    if (!guard.allowed || guard.outcome !== "allow") {
      throw new AgentRuntimeError("System One guardrail did not approve proposal: " + guard.outcome, "GUARDRAIL_REJECTED");
    }
    const permissionSnapshotHash = createHash("sha256").update(JSON.stringify(p) ?? "").digest("hex");
    let decision;
    try {
      decision = await this.decisions.record({
        decisionId: randomUUID(), schemaVersion: 1, createdAt: new Date().toISOString(),
        accountRef: p.owner, agentVersion: "handel-agent-runtime-v1",
        modelId: typeof (g.verification as { modelId?: unknown } | undefined)?.modelId === "string"
          ? (g.verification as { modelId: string }).modelId : "model-id-not-returned",
        authorityMode: "permission-snapshot-only", permissionSnapshotHash,
        action: proposal.type, assetId: proposal.underlyingAssetId,
        optionTerms: { strike: proposal.strike, quantity: proposal.quantity, expiryNs: proposal.expiryNs, premium: proposal.premium },
        marketEvidence: {
          source: market.source, observedAt: market.observedAt,
          verificationMethod: marketVerification.method, evidenceHash: marketVerification.evidenceHash,
          evidenceType, executionEligible: true,
          snapshotHash: createHash("sha256").update(JSON.stringify(market) ?? "").digest("hex"),
        },
        premiumEvidence: { source: q.source, calculatedAt: q.calculatedAt, methodology: q.methodology, evidenceHash: q.evidenceHash, verificationMethod: q.verificationMethod },
        guardrailEvidence: { decisionId: guard.decisionId, outcome: guard.outcome, confidence: guard.confidence, signatureKind: guard.signatureKind },
        rationale: proposal.rationale, risks: proposal.risks,
        alternativesEvaluated: [], uncertainty: ["No separately calibrated uncertainty estimate was supplied."],
        policy: { ok: policy.ok, errors: policy.errors, warnings: policy.warnings },
        approvalState: "not-requested-at-proposal-stage", executionState: "proposed",
      });
    } catch {
      throw new AgentRuntimeError("durable decision record could not be committed", "DECISION_JOURNAL_FAILED");
    }
    return {
      proposal, policy, premiumQuote: q, market, marketVerification,
      providerRequestId: g.requestId, providerVerification: g.verification,
      usage: g.usage, guardrail: guard, decisionId: decision.decisionId,
      decisionRecordHash: decision.recordHash,
    };
  }
}
