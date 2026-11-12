/** Connects live AI advisory output to the two-step on-chain agent workflow. */
import type { AgentPermission } from "./types.js";
import { HandelAdvisoryAgent, type AdvisoryAgentRequest } from "./advisory-agent.js";
import { prepareAgentProposal, type PreparedAgentProposal } from "./proposal-workflow.js";

export interface PreparedAdvisoryApproval {
  advisory: Awaited<ReturnType<HandelAdvisoryAgent["propose"]>>;
  prepared: PreparedAgentProposal;
  nextStep: "agent_submits_pending_proposal_then_principal_approves";
  executionEligible: false;
}

/**
 * Runs Chat + System One, then prepares an advisory-only contract proposal.
 * No wallet is called here. The configured agent account must submit the
 * pending proposal, after which the principal separately approves it on-chain.
 */
export async function prepareAdvisoryAgentProposal(input: {
  agent: HandelAdvisoryAgent;
  request: AdvisoryAgentRequest;
  permission: AgentPermission;
  holder: string;
}): Promise<PreparedAdvisoryApproval> {
  const advisory = await input.agent.propose(input.request, input.permission);
  if (advisory.executionEligible !== false || advisory.approvalRequired !== true) {
    throw new Error("advisory agent returned an invalid authority state");
  }
  const result = prepareAgentProposal({
    proposal: advisory.proposal,
    holder: input.holder,
    permission: input.permission,
    evidenceMode: "advisory_only",
  });
  if (!result.ok) {
    throw new Error("advisory proposal cannot be represented by current on-chain policy: " + result.errors.join("; "));
  }
  return {
    advisory,
    prepared: result.prepared,
    nextStep: "agent_submits_pending_proposal_then_principal_approves",
    executionEligible: false,
  };
}
