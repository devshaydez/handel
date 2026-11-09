#!/usr/bin/env node
/**
 * Live, read-only Tidepool quote smoke test.
 * Uses only valueless Testnet assets and dry:true; never creates a deposit
 * address, signs a wallet payload, submits a transaction, or moves tokens.
 */
import assert from "node:assert/strict";

const BASE = "https://www.usetidepool.tech";
const ORIGIN = "nep141:usdc.tidepool-sandbox.testnet";
const DESTINATION = "nep141:wnear.tidepool-sandbox.testnet";
const AMOUNT = "1000000"; // 1 USDC at 6 decimals
const TEST_ACCOUNT = "handel-smoke.testnet";
const timeout = AbortSignal.timeout(20_000);

async function json(url, init) {
  const response = await fetch(url, { ...init, signal: timeout });
  const body = await response.json().catch(() => null);
  assert.equal(response.ok, true, `HTTP ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

const tokens = await json(`${BASE}/v0/tokens`, { headers: { accept: "application/json" } });
assert.ok(Array.isArray(tokens), "Tidepool token registry must return an array");
const usdc = tokens.find((token) => token.assetId === ORIGIN);
const wnear = tokens.find((token) => token.assetId === DESTINATION);
assert.ok(usdc, `Tidepool registry is missing ${ORIGIN}`);
assert.ok(wnear, `Tidepool registry is missing ${DESTINATION}`);
assert.equal(usdc.decimals, 6, "USDC decimals must be 6");
assert.equal(wnear.decimals, 24, "wNEAR decimals must be 24");

const deadline = new Date(Date.now() + 10 * 60_000).toISOString();
const request = {
  dry: true,
  swapType: "EXACT_INPUT",
  slippageTolerance: 100,
  originAsset: ORIGIN,
  depositType: "INTENTS",
  destinationAsset: DESTINATION,
  amount: AMOUNT,
  refundTo: TEST_ACCOUNT,
  refundType: "INTENTS",
  recipient: TEST_ACCOUNT,
  recipientType: "DESTINATION_CHAIN",
  deadline,
};
const response = await json(`${BASE}/v0/quote`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(request),
});
assert.equal(typeof response.correlationId, "string", "quote must include correlationId");
assert.ok(response.quote && typeof response.quote === "object", "quote payload is missing");
assert.equal(response.quote.amountIn, AMOUNT, "quote amountIn must match exact input");
assert.match(response.quote.amountOut ?? "", /^[1-9][0-9]*$/, "quote amountOut must be positive base units");
assert.match(response.quote.minAmountOut ?? "", /^[1-9][0-9]*$/, "quote minAmountOut must be positive base units");
assert.equal(typeof response.signature, "string", "quote signature is missing");
assert.equal("depositAddress" in response.quote, false, "dry quote must not create a deposit address");

console.log(JSON.stringify({
  status: "PASS",
  checkedAt: new Date().toISOString(),
  endpoint: `${BASE}/v0/quote`,
  dry: true,
  originAsset: ORIGIN,
  destinationAsset: DESTINATION,
  amountIn: response.quote.amountIn,
  amountOut: response.quote.amountOut,
  minAmountOut: response.quote.minAmountOut,
  quoteSignaturePresent: true,
  depositAddressCreated: false,
  transactionSubmitted: false,
  caveat: "Live Tidepool maker quote for valueless Testnet assets only; not Ondo support or Mainnet liquidity proof."
}, null, 2));
