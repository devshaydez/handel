import test from "node:test";
import assert from "node:assert/strict";
import { NVDAON_ASSET_ID } from "./assets.js";
import { proposalToAgentProposalArgs, proposalToCreateArgs, stubProposal } from "./proposal.js";
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

test("writer proposal maps to the Rust create_call argument names", () => {
  const proposal = stubProposal({ underlyingAssetId: NVDAON_ASSET_ID, daysToExpiry: 2 });
  const result = proposalToCreateArgs(proposal, "buyer.testnet");

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.method, "create_call");
  assert.deepEqual(result.args, {
    holder: "buyer.testnet",
    asset_id: NVDAON_ASSET_ID,
    underlying_amount: proposal.quantity,
    strike_amount_usdc: proposal.strike,
    expiry_ns: proposal.expiryNs,
    premium_amount_usdc: proposal.premium,
  });
});

test("agent proposal maps to the Rust approval-gated method", () => {
  const proposal = stubProposal({
    underlyingAssetId: NVDAON_ASSET_ID,
    type: "Put",
    daysToExpiry: 2,
  });
  const result = proposalToAgentProposalArgs(proposal, "buyer.testnet", permission);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.method, "create_agent_proposal");
  assert.equal(result.args.kind, "Put");
  assert.equal(result.args.proposal_id, proposal.proposalId);
  assert.match(result.args.rationale_hash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(result.args.holder, "buyer.testnet");
});

test("invalid proposal is rejected before a contract call is built", () => {
  const proposal = stubProposal({ underlyingAssetId: "nep141:unknown.testnet", daysToExpiry: 2 });
  const result = proposalToCreateArgs(proposal, "buyer.testnet");

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.errors.some((error) => error.includes("underlying must be a curated Ondo asset or explicitly allowlisted by the principal")));
});


test("both direct and agent proposal builders reject stale market evidence", () => {
  const staleDirect = stubProposal({ underlyingAssetId: NVDAON_ASSET_ID, daysToExpiry: 2 });
  staleDirect.dataFreshness = new Date(Date.now() - 600_000).toISOString();
  const direct = proposalToCreateArgs(staleDirect, "buyer.testnet");
  assert.equal(direct.ok, false);
  if (!direct.ok) assert.ok(direct.errors.some(error => error.includes("market data older")));

  const staleAgent = stubProposal({ underlyingAssetId: NVDAON_ASSET_ID, daysToExpiry: 2 });
  staleAgent.dataFreshness = new Date(Date.now() - 600_000).toISOString();
  const agent = proposalToAgentProposalArgs(staleAgent, "buyer.testnet", permission);
  assert.equal(agent.ok, false);
  if (!agent.ok) assert.ok(agent.errors.some(error => error.includes("market data older")));
});
