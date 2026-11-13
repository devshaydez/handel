import test from "node:test";
import assert from "node:assert/strict";
import {
  prepareAgentProposal,
  submitAgentProposal,
  approveAgentProposal,
  isAccountId,
} from "./proposal-workflow.js";
import { stubProposal } from "./proposal.js";
import { NVDAON_ASSET_ID } from "./assets.js";
import type { AgentPermission } from "./types.js";

const permission: AgentPermission = {
  agent: "agent.testnet",
  owner: "writer.testnet",
  allowedAssets: [NVDAON_ASSET_ID],
  maxQuantity: "2000000000000000000",
  maxPremium: "10000000",
  maxOpenPositions: 2,
  minExpiryNs: "0",
  maxExpiryNs: "999999999999999999999",
  enabled: true,
};

test("prepares exact terms for principal preview", () => {
  const proposal = stubProposal({ underlyingAssetId: NVDAON_ASSET_ID, daysToExpiry: 2 });
  const result = prepareAgentProposal({ proposal, holder: "buyer.testnet", permission });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.prepared.args.holder, "buyer.testnet");
    assert.equal(result.prepared.args.underlying_amount, proposal.quantity);
    assert.equal(result.prepared.agentId, permission.agent);
    assert.equal(result.prepared.principal, permission.owner);
    assert.equal(result.prepared.principalApprovalRequired, true);
    assert.equal(result.prepared.executionEligible, false);
  }
});

test("agent submits pending proposal and principal separately approves it", async () => {
  const proposal = stubProposal({ underlyingAssetId: NVDAON_ASSET_ID, daysToExpiry: 2 });
  const result = prepareAgentProposal({ proposal, holder: "buyer.testnet", permission });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const submissions: unknown[] = [];
  await submitAgentProposal({
    signerAccountId: permission.agent,
    prepared: result.prepared,
    signWithConnectedWallet: async (method, args) => { submissions.push({ method, args }); return "agent-tx"; },
  });
  assert.equal((submissions[0] as { method: string }).method, "create_agent_proposal");

  const approvals: unknown[] = [];
  await approveAgentProposal({
    approved: true,
    signerAccountId: permission.owner,
    prepared: result.prepared,
    approveWithConnectedWallet: async (method, args) => { approvals.push({ method, args }); return "principal-tx"; },
  });
  assert.deepEqual(approvals[0], {
    method: "approve_agent_proposal",
    args: { proposal_id: proposal.proposalId },
  });
});

test("agent and principal signer roles are enforced independently", async () => {
  const proposal = stubProposal({ underlyingAssetId: NVDAON_ASSET_ID, daysToExpiry: 2 });
  const result = prepareAgentProposal({ proposal, holder: "buyer.testnet", permission });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  let calls = 0;
  const signer = async () => { calls++; return "signed"; };
  await assert.rejects(() => submitAgentProposal({
    signerAccountId: permission.owner, prepared: result.prepared, signWithConnectedWallet: signer,
  }), /configured agent account/);
  await assert.rejects(() => approveAgentProposal({
    approved: true, signerAccountId: permission.agent, prepared: result.prepared,
    approveWithConnectedWallet: async () => { calls++; return "approved"; },
  }), /configured principal/);
  await assert.rejects(() => approveAgentProposal({
    approved: false, signerAccountId: permission.owner, prepared: result.prepared,
    approveWithConnectedWallet: async () => { calls++; return "approved"; },
  }), /explicit principal approval/);
  assert.equal(calls, 0);
});

test("advisory-only proposals can be prepared without pretending market data is fresh", () => {
  const proposal = {
    ...stubProposal({ underlyingAssetId: NVDAON_ASSET_ID, daysToExpiry: 2 }),
    dataFreshness: "not-used: no verified market feed configured",
  };
  const result = prepareAgentProposal({
    proposal, holder: "buyer.testnet", permission, evidenceMode: "advisory_only",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.prepared.evidenceMode, "advisory_only");
    assert.equal(result.prepared.executionEligible, false);
    assert.ok(result.prepared.warnings.length > 0);
  }
});

test("proposal preparation rejects the principal as holder", () => {
  const proposal = stubProposal({ underlyingAssetId: NVDAON_ASSET_ID, daysToExpiry: 2 });
  const result = prepareAgentProposal({ proposal, holder: permission.owner, permission });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.errors.join(" "), /distinct from the principal/);
});

test("account IDs reject malformed values", () => {
  assert.equal(isAccountId("buyer.testnet"), true);
  assert.equal(isAccountId("Buyer.testnet"), false);
  assert.equal(isAccountId("buyer..testnet"), false);
});
