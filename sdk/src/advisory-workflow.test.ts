import test from "node:test";
import assert from "node:assert/strict";
import { HandelAdvisoryAgent } from "./advisory-agent.js";
import { prepareAdvisoryAgentProposal } from "./advisory-workflow.js";
import { submitAgentProposal, approveAgentProposal } from "./proposal-workflow.js";
import type { AgentPermission, AgentProposal } from "./types.js";
import { NVDAON_ASSET_ID } from "./assets.js";

const request = {
  type: "Call" as const,
  assetId: NVDAON_ASSET_ID,
  quantity: "1000000000000000000",
  strike: "2500000",
  expiryNs: (BigInt(Date.now() + 86_400_000) * 1_000_000n).toString(),
  objective: "Prepare a simulated option proposal for principal review",
  demoPremiumFixture: "100000",
};
const permission: AgentPermission = {
  agent: "agent.testnet",
  owner: "principal.testnet",
  allowedAssets: [NVDAON_ASSET_ID],
  maxQuantity: "2000000000000000000",
  maxPremium: "1000000",
  maxOpenPositions: 2,
  minExpiryNs: "1",
  maxExpiryNs: "999999999999999999999999999999",
  enabled: true,
};
const proposal: AgentProposal = {
  proposalId: "advisory-approval-bridge-1",
  type: request.type,
  underlyingAssetId: request.assetId,
  quantity: request.quantity,
  strike: request.strike,
  premium: "999999999",
  expiryNs: request.expiryNs,
  estimatedPayoff: "Model estimate discarded by advisory runtime",
  risks: ["Synthetic demo asset; no verified market feed"],
  dataFreshness: "not-used: no verified market feed configured",
  rationale: "Synthetic proposal for explicit principal review.",
  createdAt: new Date().toISOString(),
};
function makeAgent() {
  return new HandelAdvisoryAgent(
    { propose: async () => ({ proposal, requestId: "request-1", verification: { signatureKind: "provider_tee" } }) },
    { evaluate: async () => ({ allowed: true, outcome: "allow", confidence: 0.99, decisionId: "guard-1", signatureKind: "gateway" }) },
  );
}

test("live advisory proposal bridges to agent submission then separate principal approval", async () => {
  const result = await prepareAdvisoryAgentProposal({
    agent: makeAgent(), request, permission, holder: "holder.testnet",
  });
  assert.equal(result.executionEligible, false);
  assert.equal(result.prepared.evidenceMode, "advisory_only");
  assert.equal(result.prepared.principalApprovalRequired, true);
  assert.equal(result.prepared.args.premium_amount_usdc, request.demoPremiumFixture);

  const submitted: unknown[] = [];
  await submitAgentProposal({
    signerAccountId: "agent.testnet",
    prepared: result.prepared,
    signWithConnectedWallet: async (method, args) => { submitted.push({ method, args }); return "agent-tx"; },
  });
  assert.equal((submitted[0] as { method: string }).method, "create_agent_proposal");

  const approved: unknown[] = [];
  await approveAgentProposal({
    approved: true,
    signerAccountId: "principal.testnet",
    prepared: result.prepared,
    approveWithConnectedWallet: async (method, args) => { approved.push({ method, args }); return "principal-tx"; },
  });
  assert.equal((approved[0] as { method: string }).method, "approve_agent_proposal");
  assert.deepEqual((approved[0] as { args: unknown }).args, { proposal_id: proposal.proposalId });
});

test("agent and principal wallet roles cannot be interchanged", async () => {
  const result = await prepareAdvisoryAgentProposal({
    agent: makeAgent(), request, permission, holder: "holder.testnet",
  });
  await assert.rejects(() => submitAgentProposal({
    signerAccountId: "principal.testnet",
    prepared: result.prepared,
    signWithConnectedWallet: async () => "should-not-run",
  }), /configured agent account/);
  await assert.rejects(() => approveAgentProposal({
    approved: true,
    signerAccountId: "agent.testnet",
    prepared: result.prepared,
    approveWithConnectedWallet: async () => "should-not-run",
  }), /configured principal/);
  await assert.rejects(() => approveAgentProposal({
    approved: false,
    signerAccountId: "principal.testnet",
    prepared: result.prepared,
    approveWithConnectedWallet: async () => "should-not-run",
  }), /explicit principal approval/);
});
