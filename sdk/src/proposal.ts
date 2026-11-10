/**
 * AI proposal helpers.
 *
 * AI output is untrusted. These builders only translate validated proposal
 * data into the actual Rust contract method arguments; the contract remains
 * the final policy and state authority.
 */

import { createHash, randomUUID } from "node:crypto";
import type { AgentProposal, OptionType } from "./types.js";
import { validateProposal } from "./policy.js";
import type { AgentPermission } from "./types.js";

export interface CreateOptionArgs {
  holder: string;
  asset_id: string;
  underlying_amount: string;
  strike_amount_usdc: string;
  expiry_ns: string;
  premium_amount_usdc: string;
}

export interface CreateAgentProposalArgs extends CreateOptionArgs {
  proposal_id: string;
  kind: OptionType;
  rationale_hash: string;
}

/** Build a proposal skeleton the deterministic fallback or a provider can fill. */
export function emptyProposal(partial: Partial<AgentProposal> = {}): AgentProposal {
  return {
    proposalId: partial.proposalId ?? randomUUID(),
    type: partial.type ?? "Call",
    underlyingAssetId: partial.underlyingAssetId ?? "",
    strike: partial.strike ?? "0",
    quantity: partial.quantity ?? "0",
    premium: partial.premium ?? "0",
    expiryNs: partial.expiryNs ?? "0",
    estimatedPayoff: partial.estimatedPayoff ?? "",
    risks: partial.risks ?? [],
    dataFreshness: partial.dataFreshness ?? new Date().toISOString(),
    rationale: partial.rationale ?? "",
    createdAt: partial.createdAt ?? new Date().toISOString(),
  };
}

/**
 * Translate a proposal into create_call/create_put arguments.
 * This matches the public Rust contract methods exactly.
 */
export function proposalToCreateArgs(
  proposal: AgentProposal,
  holder: string,
  permission: AgentPermission | null = null
): { ok: true; method: "create_call" | "create_put"; args: CreateOptionArgs } | { ok: false; errors: string[] } {
  const result = validateProposal(proposal, permission, { requireFreshMarketData: true });
  if (!result.ok) return { ok: false, errors: result.errors };
  if (!holder.trim()) return { ok: false, errors: ["holder account is required"] };

  return {
    ok: true,
    method: proposal.type === "Call" ? "create_call" : "create_put",
    args: {
      holder,
      asset_id: proposal.underlyingAssetId,
      underlying_amount: proposal.quantity,
      strike_amount_usdc: proposal.strike,
      expiry_ns: proposal.expiryNs,
      premium_amount_usdc: proposal.premium,
    },
  };
}

/**
 * Translate an agent proposal into create_agent_proposal arguments.
 * The agent is the transaction predecessor; the principal must approve the
 * proposal on-chain before collateral locking can begin.
 */
export function proposalToAgentProposalArgs(
  proposal: AgentProposal,
  holder: string,
  permission: AgentPermission
): { ok: true; method: "create_agent_proposal"; args: CreateAgentProposalArgs } | { ok: false; errors: string[] } {
  const result = validateProposal(proposal, permission, { requireAgent: true, requireFreshMarketData: true });
  if (!result.ok) return { ok: false, errors: result.errors };
  if (!holder.trim()) return { ok: false, errors: ["holder account is required"] };

  const rationaleHash = createHash("sha256").update(proposal.rationale).digest("hex");
  return {
    ok: true,
    method: "create_agent_proposal",
    args: {
      proposal_id: proposal.proposalId,
      kind: proposal.type,
      holder,
      asset_id: proposal.underlyingAssetId,
      underlying_amount: proposal.quantity,
      strike_amount_usdc: proposal.strike,
      expiry_ns: proposal.expiryNs,
      premium_amount_usdc: proposal.premium,
      rationale_hash: `sha256:${rationaleHash}`,
    },
  };
}

/**
 * Deterministic local fallback for demos without a NEAR AI Cloud API key.
 * This is illustrative input, not a market quote or investment recommendation.
 */
export function stubProposal(params: {
  underlyingAssetId: string;
  type?: OptionType;
  quantity?: string;
  strike?: string;
  premium?: string;
  daysToExpiry?: number;
}): AgentProposal {
  const days = params.daysToExpiry ?? 7;
  const expiryNs = (BigInt(Date.now()) * 1_000_000n + BigInt(days) * 86_400_000_000_000n).toString();

  return emptyProposal({
    type: params.type ?? "Call",
    underlyingAssetId: params.underlyingAssetId,
    strike: params.strike ?? "100000000",
    quantity: params.quantity ?? "1000000000000000000",
    premium: params.premium ?? "5000000",
    expiryNs,
    estimatedPayoff: "Illustrative only; no live market data or payoff estimate is used.",
    risks: [
      "Underlying price can move against the position",
      "Settlement is not live on NEAR Testnet; Intents is represented by a mock adapter",
      "Hackathon demonstration only — not production",
    ],
    dataFreshness: new Date().toISOString(),
    rationale: "Deterministic local fallback proposal. Replace with NEAR AI Cloud output when API access is available.",
  });
}
