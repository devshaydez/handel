import test from "node:test";
import assert from "node:assert/strict";
import { HandelAgentRuntime } from "./agent-runtime.js";
import { stubProposal } from "./proposal.js";
import { NVDAON_ASSET_ID } from "./assets.js";
import type { AgentPermission } from "./types.js";

const now = Date.now();
const market = { assetId: NVDAON_ASSET_ID, spotPrice: "1200000", quoteCurrency: "USDC" as const, observedAt: new Date(now).toISOString(), source: "fixture" };
const permission: AgentPermission = {
  agent: "agent.near", owner: "owner.near", allowedAssets: [NVDAON_ASSET_ID],
  maxQuantity: "2000000000000000000", maxPremium: "10000000", maxOpenPositions: 2,
  minExpiryNs: "1", maxExpiryNs: "999999999999999999999999999999", enabled: true,
};
const request = {
  type: "Call" as const, assetId: NVDAON_ASSET_ID, quantity: "1000000000000000000",
  strike: "100000000", expiryNs: (BigInt(now + 86400000) * 1000000n).toString(), objective: "covered call",
};
function make(premium = "5000000", guard = async () => ({
  allowed: true, outcome: "allow" as const, confidence: 0.99, decisionId: "guard-1", signatureKind: "provider_tee" as const,
})) {
  const proposal = stubProposal({ underlyingAssetId: NVDAON_ASSET_ID, quantity: request.quantity, strike: request.strike, daysToExpiry: 1 });
  proposal.expiryNs = request.expiryNs;
  return new HandelAgentRuntime(
    { propose: async () => ({ proposal, requestId: "r" }) },
    { quote: () => ({ premium, source: "fixture-engine", calculatedAt: new Date().toISOString(), methodology: "fixture" }) },
    { evaluate: guard },
  );
}

test("host replaces model premium and requires an attested guardrail allow", async () => {
  const result = await make().propose(request, permission, market);
  assert.equal(result.proposal.premium, "5000000");
  assert.equal(result.policy.ok, true);
  assert.equal(result.guardrail.decisionId, "guard-1");
});
test("blocks revoked and disallowed agents", async () => {
  await assert.rejects(() => make().propose(request, { ...permission, enabled: false }, market));
  await assert.rejects(() => make().propose(request, { ...permission, allowedAssets: [] }, market));
});
test("blocks stale data and invalid quote", async () => {
  await assert.rejects(() => make().propose(request, permission, { ...market, observedAt: new Date(now - 400000).toISOString() }));
  await assert.rejects(() => make("0").propose(request, permission, market));
});
test("fails closed when System One blocks, requests review, or is unavailable", async () => {
  const denied = make("5000000", async () => ({
    allowed: false, outcome: "review" as const, confidence: 0.99, decisionId: "guard-2", signatureKind: "provider_tee" as const,
  }));
  await assert.rejects(() => denied.propose(request, permission, market), e => e instanceof Error && "code" in e && e.code === "GUARDRAIL_REJECTED");
  const unavailable = make("5000000", async () => { throw new Error("offline"); });
  await assert.rejects(() => unavailable.propose(request, permission, market), e => e instanceof Error && "code" in e && e.code === "GUARDRAIL_UNAVAILABLE");
});
