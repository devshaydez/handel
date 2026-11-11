import test from "node:test";
import assert from "node:assert/strict";
import { validateProposal } from "./policy.js";
import { stubProposal } from "./proposal.js";
import { NVDAON_ASSET_ID } from "./assets.js";
import type { AgentPermission } from "./types.js";

const now = Date.now();
const permission: AgentPermission = {
  agent: "agent.near", owner: "owner.near", allowedAssets: [NVDAON_ASSET_ID],
  maxQuantity: "2000000000000000000", maxPremium: "10000000", maxOpenPositions: 2,
  minExpiryNs: "1", maxExpiryNs: "999999999999999999999999999999", enabled: true,
};
function proposal() {
  return stubProposal({ underlyingAssetId: NVDAON_ASSET_ID, daysToExpiry: 1 });
}
test("strict trading validation accepts complete, fresh proposal and permission evidence", () => {
  const p = proposal();
  const result = validateProposal(p, permission, { nowNs: BigInt(now) * 1_000_000n, requireAgent: true, requireFreshMarketData: true });
  assert.equal(result.ok, true, result.errors.join("; "));
});
test("strict trading validation rejects stale or future market timestamps", () => {
  const old = proposal();
  old.dataFreshness = new Date(now - 600_000).toISOString();
  assert.ok(validateProposal(old, permission, { nowNs: BigInt(now) * 1_000_000n, requireFreshMarketData: true }).errors.some(x => x.includes("older")));
  const future = proposal();
  future.dataFreshness = new Date(now + 60_000).toISOString();
  assert.ok(validateProposal(future, permission, { nowNs: BigInt(now) * 1_000_000n, requireFreshMarketData: true }).errors.some(x => x.includes("future")));
});
test("strict trading validation rejects malformed rationale, payoff and risk descriptions", () => {
  const p = proposal();
  p.rationale = " ";
  p.estimatedPayoff = "";
  p.risks = ["", "valid risk"];
  const result = validateProposal(p, permission, { nowNs: BigInt(now) * 1_000_000n, requireFreshMarketData: true });
  assert.ok(result.errors.some(x => x.includes("rationale")));
  assert.ok(result.errors.some(x => x.includes("estimatedPayoff")));
  assert.ok(result.errors.some(x => x.includes("risk descriptions")));
});
test("strict trading validation rejects malformed permission identity, duplicate assets and zero limits", () => {
  const p = proposal();
  const bad = { ...permission, agent: "bad account", allowedAssets: [NVDAON_ASSET_ID, NVDAON_ASSET_ID], maxQuantity: "0" };
  const result = validateProposal(p, bad, { nowNs: BigInt(now) * 1_000_000n, requireAgent: true, requireFreshMarketData: true });
  assert.ok(result.errors.some(x => x.includes("agent account ID")));
  assert.ok(result.errors.some(x => x.includes("unique agent allowlist")));
});
test("unsigned integers must be canonical and within uint256", () => {
  const p = proposal();
  p.quantity = "01";
  const result = validateProposal(p, permission, { nowNs: BigInt(now) * 1_000_000n, requireFreshMarketData: true });
  assert.ok(result.errors.some(x => x.includes("quantity")));
});
