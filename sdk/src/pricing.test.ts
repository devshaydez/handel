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
};
const expiry = (BigInt(now) * 1_000_000n + 31_557_600_000_000_000n).toString();
const engine = new BlackScholesPremiumEngine(() => now);

test("prices European calls and puts deterministically in total USDC minor units", () => {
  const call = engine.quote({ type: "Call", assetId: NVDAON_ASSET_ID, quantity: "1000000000000000000", strike: "100000000", expiryNs: expiry, market });
  const put = engine.quote({ type: "Put", assetId: NVDAON_ASSET_ID, quantity: "1000000000000000000", strike: "100000000", expiryNs: expiry, market });
  assert.equal(call.premium, "9250000");
  assert.equal(put.premium, "6250000");
  assert.equal(engine.quote({ type: "Call", assetId: NVDAON_ASSET_ID, quantity: "1000000000000000000", strike: "100000000", expiryNs: expiry, market }).premium, call.premium);
});
test("rejects stale, wrong-asset, expired and unsupported market assumptions", () => {
  assert.throws(() => engine.quote({ type: "Call", assetId: "other", quantity: "1000000000000000000", strike: "100000000", expiryNs: expiry, market }));
  assert.throws(() => engine.quote({ type: "Call", assetId: NVDAON_ASSET_ID, quantity: "1000000000000000000", strike: "100000000", expiryNs: expiry, market: { ...market, volatilityObservedAt: new Date(now - 400000).toISOString() } }));
  assert.throws(() => engine.quote({ type: "Put", assetId: NVDAON_ASSET_ID, quantity: "1000000000000000000", strike: "100000000", expiryNs: (BigInt(now) - 1n).toString(), market }));
  assert.throws(() => engine.quote({ type: "Call", assetId: NVDAON_ASSET_ID, quantity: "1000000000000000000", strike: "100000000", expiryNs: expiry, market: { ...market, annualizedVolatility: "9" } }));
});
test("supports total strike notional for fractional quantities and rejects unsafe numeric ranges", () => {
  const result = engine.quote({ type: "Call", assetId: NVDAON_ASSET_ID, quantity: "500000000000000000", strike: "50000000", expiryNs: expiry, market });
  assert.ok(BigInt(result.premium) > 0n);
  assert.throws(() => engine.quote({ type: "Call", assetId: NVDAON_ASSET_ID, quantity: "999999999999999999999999999", strike: "50000000", expiryNs: expiry, market }));
});
