/**
 * AI proposal helpers.
 * The AI produces structured proposals; this module validates shape and
 * prepares the on-chain create_position arguments. Never treat AI output
 * as an oracle or as authority to bypass contract rules.
 */

import { randomUUID } from "node:crypto";
import type { AgentProposal, OptionType } from "./types.js";
import { validateProposal } from "./policy.js";
import type { AgentPermission } from "./types.js";

export interface CreatePositionArgs {
  option_type: OptionType;
  underlying_asset_id: string;
  strike: string;
  quantity: string;
  premium: string;
  expiry_ns: string;
  create_op_id: string;
  as_agent_for?: string;
}

/** Build a proposal skeleton the AI (or a human) can fill */
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
 * Convert a validated proposal into the exact arguments for
 * `create_position` on the options contract.
 */
export function proposalToCreateArgs(
  proposal: AgentProposal,
  permission: AgentPermission | null = null,
  asAgentFor?: string
): { ok: true; args: CreatePositionArgs } | { ok: false; errors: string[] } {
  const result = validateProposal(proposal, permission, {
    requireAgent: !!asAgentFor,
  });
  if (!result.ok) {
    return { ok: false, errors: result.errors };
  }

  return {
    ok: true,
    args: {
      option_type: proposal.type,
      underlying_asset_id: proposal.underlyingAssetId,
      strike: proposal.strike,
      quantity: proposal.quantity,
      premium: proposal.premium,
      expiry_ns: proposal.expiryNs,
      create_op_id: `prop-${proposal.proposalId}`,
      ...(asAgentFor ? { as_agent_for: asAgentFor } : {}),
    },
  };
}

/**
 * Minimal deterministic "AI" stub for demos when NEAR AI Cloud key is absent.
 * Produces a conservative small Call on NVDAon. Label clearly in README.
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
    strike: params.strike ?? "100000000", // 100 USDC (6 decimals) example
    quantity: params.quantity ?? "1000000000000000000", // 1 token
    premium: params.premium ?? "5000000", // 5 USDC
    expiryNs,
    estimatedPayoff: "Max loss = premium. Max gain unbounded for call (theoretical).",
    risks: [
      "Underlying price moves against position",
      "Settlement depends on Intents liquidity / routes",
      "Hackathon demo only — not production",
    ],
    dataFreshness: new Date().toISOString(),
    rationale: "Stub proposal for vertical-slice demo. Replace with NEAR AI Cloud output.",
  });
}
