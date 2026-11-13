/** Explicit agent submission and separate principal approval boundaries. */
import type { AgentPermission, AgentProposal } from "./types.js";
import { validateProposal } from "./policy.js";
import { proposalToAgentProposalArgs } from "./proposal.js";
import type { CreateAgentProposalArgs } from "./proposal.js";

export interface PreparedAgentProposal {
  proposal: AgentProposal;
  holder: string;
  agentId: string;
  principal: string;
  evidenceMode: "verified_market" | "advisory_only";
  method: "create_agent_proposal";
  args: CreateAgentProposalArgs;
  warnings: string[];
  principalApprovalRequired: true;
  executionEligible: false;
}

export function isAccountId(v: string): boolean {
  return typeof v === "string" && v.length >= 2 && v.length <= 64 &&
    /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(v);
}

/**
 * Prepares the exact contract call. Advisory-only proposals may be recorded
 * without market-data freshness, but remain explicitly non-executable and
 * require a separate principal approval transaction on-chain.
 */
export function prepareAgentProposal(input: {
  proposal: AgentProposal;
  holder: string;
  permission: AgentPermission;
  evidenceMode?: "verified_market" | "advisory_only";
}): { ok: true; prepared: PreparedAgentProposal } | { ok: false; errors: string[] } {
  if (!isAccountId(input.holder)) return { ok: false, errors: ["holder account identifier is invalid"] };
  if (input.holder === input.permission?.owner) return { ok: false, errors: ["holder must be distinct from the principal/writer"] };
  if (!isAccountId(input.permission?.agent) || !isAccountId(input.permission?.owner)) {
    return { ok: false, errors: ["agent and principal account identifiers are required"] };
  }
  const evidenceMode = input.evidenceMode ?? "verified_market";
  const requireFreshMarketData = evidenceMode === "verified_market";
  const policy = validateProposal(input.proposal, input.permission, {
    requireAgent: true,
    requireFreshMarketData,
  });
  if (!policy.ok) return { ok: false, errors: policy.errors };
  const built = proposalToAgentProposalArgs(input.proposal, input.holder, input.permission, {
    requireFreshMarketData,
  });
  if (!built.ok) return built;
  return {
    ok: true,
    prepared: {
      proposal: structuredClone(input.proposal),
      holder: input.holder,
      agentId: input.permission.agent,
      principal: input.permission.owner,
      evidenceMode,
      method: built.method,
      args: built.args,
      warnings: policy.warnings,
      principalApprovalRequired: true,
      executionEligible: false,
    },
  };
}

/** Agent account signs create_agent_proposal; this does NOT approve the trade. */
export async function submitAgentProposal<T>(input: {
  signerAccountId: string;
  prepared: PreparedAgentProposal;
  signWithConnectedWallet: (method: "create_agent_proposal", args: CreateAgentProposalArgs) => Promise<T>;
}): Promise<T> {
  if (input.signerAccountId !== input.prepared.agentId) {
    throw Error("connected wallet must be the configured agent account to submit create_agent_proposal");
  }
  return input.signWithConnectedWallet(input.prepared.method, structuredClone(input.prepared.args));
}

/** Principal separately signs approve_agent_proposal after reviewing the on-chain pending proposal. */
export async function approveAgentProposal<T>(input: {
  approved: boolean;
  signerAccountId: string;
  prepared: PreparedAgentProposal;
  approveWithConnectedWallet: (method: "approve_agent_proposal", args: { proposal_id: string }) => Promise<T>;
}): Promise<T> {
  if (input.approved !== true) throw Error("explicit principal approval is required");
  if (input.signerAccountId !== input.prepared.principal) {
    throw Error("connected wallet must be the configured principal to approve this proposal");
  }
  return input.approveWithConnectedWallet("approve_agent_proposal", {
    proposal_id: input.prepared.proposal.proposalId,
  });
}
