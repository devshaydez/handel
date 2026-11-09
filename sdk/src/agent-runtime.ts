import type { AgentPermission, AgentProposal, OptionType } from "./types.js";
import { validateProposal } from "./policy.js";
import { validateMarketSnapshot, type MarketSnapshot } from "./market-context.js";

export interface ProposalProvider {
  propose(x: unknown): Promise<{ proposal: AgentProposal; requestId?: string; verification?: unknown; usage?: unknown }>;
}
export interface PremiumQuote {
  premium: string;
  source: string;
  calculatedAt: string;
  methodology: string;
}
export interface PremiumEngine {
  quote(x: { type: OptionType; assetId: string; quantity: string; strike: string; expiryNs: string; market: MarketSnapshot }): Promise<PremiumQuote> | PremiumQuote;
}
export interface ProposalGuardrail {
  evaluate(state: unknown): Promise<{
    allowed: boolean;
    outcome: "allow" | "block" | "review";
    confidence: number;
    decisionId: string;
    signatureKind: "provider_tee";
  }>;
}
export interface AgentRequest {
  type: OptionType;
  assetId: string;
  quantity: string;
  strike: string;
  expiryNs: string;
  objective: string;
}
export class AgentRuntimeError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = "AgentRuntimeError";
  }
}

/** Trading proposals fail closed unless an independently attested guardrail is configured. */
export class HandelAgentRuntime {
  constructor(
    private provider: ProposalProvider,
    private pricing: PremiumEngine,
    private guardrail: ProposalGuardrail,
  ) {}

  async propose(r: AgentRequest, p: AgentPermission, s: MarketSnapshot) {
    if (!p?.enabled) throw new AgentRuntimeError("agent revoked", "AGENT_REVOKED");
    if (!p.allowedAssets.includes(r.assetId)) throw new AgentRuntimeError("asset not allowlisted", "ASSET_NOT_ALLOWED");
    const market = validateMarketSnapshot(s, r.assetId);
    const g = await this.provider.propose({
      task: "handel_european_option",
      objective: r.objective,
      requestedTerms: r,
      marketContext: market,
      instructions: "Do not invent premium or market data; host replaces premium with deterministic quote.",
    });
    const c = g.proposal;
    if (c.type !== r.type || c.underlyingAssetId !== r.assetId || c.quantity !== r.quantity ||
        c.strike !== r.strike || c.expiryNs !== r.expiryNs) {
      throw new AgentRuntimeError("model changed requested terms", "TERMS_MISMATCH");
    }
    const q = await this.pricing.quote({
      type: r.type,
      assetId: r.assetId,
      quantity: r.quantity,
      strike: r.strike,
      expiryNs: r.expiryNs,
      market,
    });
    if (!/^\d+$/.test(q.premium) || BigInt(q.premium) <= 0n || !q.source.trim() || !q.methodology.trim()) {
      throw new AgentRuntimeError("invalid deterministic premium quote", "INVALID_PREMIUM_QUOTE");
    }
    const proposal = { ...c, premium: q.premium, dataFreshness: market.observedAt };
    const policy = validateProposal(proposal, p);
    if (!policy.ok) throw new AgentRuntimeError(policy.errors.join("; "), "POLICY_REJECTED");

    let guard;
    try {
      guard = await this.guardrail.evaluate({
        task: "handel_trade_proposal_guard",
        request: r,
        proposal,
        marketContext: market,
        deterministicPremium: q,
        policyDecision: policy,
      });
    } catch {
      throw new AgentRuntimeError("System One guardrail unavailable or unverified", "GUARDRAIL_UNAVAILABLE");
    }
    if (!guard.allowed || guard.outcome !== "allow") {
      throw new AgentRuntimeError("System One guardrail did not approve proposal: " + guard.outcome, "GUARDRAIL_REJECTED");
    }
    return {
      proposal,
      policy,
      premiumQuote: q,
      market,
      providerRequestId: g.requestId,
      providerVerification: g.verification,
      usage: g.usage,
      guardrail: guard,
    };
  }
}
