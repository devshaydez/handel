import test from "node:test";
import assert from "node:assert/strict";
import { HandelAdvisoryAgent } from "./advisory-agent.js";
import type { ProposalGuardrail } from "./agent-runtime.js";
import { NVDAON_ASSET_ID } from "./assets.js";
import type { AgentPermission, AgentProposal } from "./types.js";

const now = Date.now();
const request = {
  type: "Call" as const, assetId: NVDAON_ASSET_ID, quantity: "1000000000000000000",
  strike: "100000000", expiryNs: (BigInt(now + 86400000) * 1000000n).toString(),
  objective: "Prepare a small simulated covered call", demoPremiumFixture: "100000",
};
const permission: AgentPermission = {
  agent: "agent.testnet", owner: "owner.testnet", allowedAssets: [NVDAON_ASSET_ID],
  maxQuantity: "2000000000000000000", maxPremium: "1000000", maxOpenPositions: 2,
  minExpiryNs: "1", maxExpiryNs: "999999999999999999999999999999", enabled: true,
};
function proposal(): AgentProposal {
  return {
    proposalId: "advisory-test-1", type: request.type, underlyingAssetId: request.assetId,
    quantity: request.quantity, strike: request.strike, premium: "999999",
    expiryNs: request.expiryNs, estimatedPayoff: "model claim discarded",
    risks: ["Underlying price may move adversely"], dataFreshness: new Date().toISOString(),
    rationale: "A simulated proposal for review.", createdAt: new Date().toISOString(),
  };
}
function agent(guard: ProposalGuardrail["evaluate"] = async () => ({ allowed: true, outcome: "allow", confidence: 0.99, decisionId: "guard-1", signatureKind: "gateway" })) {
  return new HandelAdvisoryAgent(
    { propose: async () => ({ proposal: proposal(), requestId: "live-request", verification: { signatureKind: "provider_tee" } }) },
    { evaluate: guard },
  );
}
test("creates an advisory proposal, replaces model premium/payoff, and never claims execution eligibility", async () => {
  const result = await agent().propose(request, permission);
  assert.equal(result.proposal.premium, request.demoPremiumFixture);
  assert.match(result.proposal.estimatedPayoff, /Not calculated/);
  assert.equal(result.executionEligible, false);
  assert.equal(result.approvalRequired, true);
  assert.equal(result.guardrail.signatureKind, "gateway");
});
test("rejects model term mutation", async () => {
  const mutating = new HandelAdvisoryAgent(
    { propose: async () => ({ proposal: { ...proposal(), quantity: "2" } }) },
    { evaluate: async () => ({ allowed: true, outcome: "allow", confidence: 1, decisionId: "g", signatureKind: "gateway" }) },
  );
  await assert.rejects(() => mutating.propose(request, permission), /changed requested terms/);
});
test("fails closed on System One review/block/unavailable and revoked or disallowed permissions", async () => {
  await assert.rejects(() => agent(async () => ({ allowed: false, outcome: "review", confidence: 0.9, decisionId: "g", signatureKind: "gateway" })).propose(request, permission), /did not allow/);
  await assert.rejects(() => agent(async () => { throw new Error("offline"); }).propose(request, permission), /unavailable/);
  await assert.rejects(() => agent().propose(request, { ...permission, enabled: false }), /disabled or revoked/);
  await assert.rejects(() => agent().propose(request, { ...permission, allowedAssets: [] }), /not allowlisted/);
});
