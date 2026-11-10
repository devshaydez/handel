import test from "node:test";
import assert from "node:assert/strict";
import { BlackScholesPremiumEngine } from "./pricing.js";
import { NVDAON_ASSET_ID } from "./assets.js";
import type { PricingMarketSnapshot } from "./pricing.js";

const now = Date.parse("2026-01-01T00:00:00.000Z");
const market: PricingMarketSnapshot = {
  assetId: NVDAON_ASSET_ID, spotPrice: "100000000", quoteCurrency: "USDC",
  observedAt: new Date(now).toISOString(), source: "approved-fixture",
  annualizedVolatility: "0.2", riskFreeRate: "0.03", dividendYield: "0",
  volatilitySource: "approved-vol-fixture", volatilityObservedAt: new Date(now).toISOString(),
  riskFreeRateSource: "approved-rate-fixture", riskFreeRateObservedAt: new Date(now).toISOString(),
  dividendYieldSource: "approved-dividend-fixture", dividendYieldObservedAt: new Date(now).toISOString(),
};
const expiry = (BigInt(now) * 1_000_000n + 31_557_600_000_000_000n).toString();
const verifier = {
  verify: async () => ({ approved: true, method: "fixture-signed-evidence", evidenceHash: "a".repeat(64) }),
};
const engine = new BlackScholesPremiumEngine(verifier, () => now);

test("prices European calls and puts deterministically in total USDC minor units", async () => {
  const call = await engine.quote({ type: "Call", assetId: NVDAON_ASSET_ID, quantity: "1000000000000000000", strike: "100000000", expiryNs: expiry, market });
  const put = await engine.quote({ type: "Put", assetId: NVDAON_ASSET_ID, quantity: "1000000000000000000", strike: "100000000", expiryNs: expiry, market });
  assert.equal(call.premium, "9413392");
  assert.equal(put.premium, "6457945");
  assert.equal((await engine.quote({ type: "Call", assetId: NVDAON_ASSET_ID, quantity: "1000000000000000000", strike: "100000000", expiryNs: expiry, market })).premium, call.premium);
  assert.equal(call.evidenceHash, "a".repeat(64));
});

test("rejects unapproved pricing evidence", async () => {
  const denied = new BlackScholesPremiumEngine({
    verify: async () => ({ approved: false, method: "display-only", evidenceHash: "a".repeat(64) }),
  }, () => now);
  await assert.rejects(() => denied.quote({ type: "Call", assetId: NVDAON_ASSET_ID, quantity: "1000000000000000000", strike: "100000000", expiryNs: expiry, market }), /not approved/);
});

test("rejects stale, wrong-asset, expired and unsupported market assumptions", async () => {
  await assert.rejects(() => engine.quote({ type: "Call", assetId: "other", quantity: "1000000000000000000", strike: "100000000", expiryNs: expiry, market }));
  await assert.rejects(() => engine.quote({ type: "Call", assetId: NVDAON_ASSET_ID, quantity: "1000000000000000000", strike: "100000000", expiryNs: expiry, market: { ...market, volatilityObservedAt: new Date(now - 400000).toISOString() } as PricingMarketSnapshot }));
  await assert.rejects(() => engine.quote({ type: "Put", assetId: NVDAON_ASSET_ID, quantity: "1000000000000000000", strike: "100000000", expiryNs: (BigInt(now) - 1n).toString(), market }));
  await assert.rejects(() => engine.quote({ type: "Call", assetId: NVDAON_ASSET_ID, quantity: "1000000000000000000", strike: "100000000", expiryNs: expiry, market: { ...market, annualizedVolatility: "9" } as PricingMarketSnapshot }));
});

test("supports total strike notional for fractional quantities and rejects unsafe numeric ranges", async () => {
  const result = await engine.quote({ type: "Call", assetId: NVDAON_ASSET_ID, quantity: "500000000000000000", strike: "50000000", expiryNs: expiry, market });
  assert.ok(BigInt(result.premium) > 0n);
  await assert.rejects(() => engine.quote({ type: "Call", assetId: NVDAON_ASSET_ID, quantity: "999999999999999999999999999", strike: "50000000", expiryNs: expiry, market }));
});
