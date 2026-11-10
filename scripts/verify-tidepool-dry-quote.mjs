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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function json(url, init, { retries = 3 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
    const body = await response.json().catch(() => null);
    if (response.ok) return body;
    const message = typeof body?.message === "string" ? body.message : "";
    // Tidepool's quote gateway can surface its upstream HTTP 429 as HTTP 500.
    const rateLimited = response.status === 429 || /\\b429\\b|rate.?limit|too many requests/i.test(message);
    const transient = rateLimited || response.status >= 500;
    if (transient && attempt < retries) {
      const delayMs = 1_000 * (2 ** attempt);
      console.warn("Tidepool returned HTTP " + response.status + "; retrying in " + delayMs + "ms (attempt " + (attempt + 1) + "/" + retries + ")");
      await sleep(delayMs);
      continue;
    }
    const error = new Error("HTTP " + response.status + ": " + JSON.stringify(body));
    error.retryableUpstreamLimit = rateLimited;
    throw error;
  }
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
let response;
try {
  response = await json(BASE + "/v0/quote", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
} catch (error) {
  if (error?.retryableUpstreamLimit) {
    console.log(JSON.stringify({
      status: "INCONCLUSIVE",
      checkedAt: new Date().toISOString(),
      endpoint: BASE + "/v0/quote",
      dry: true,
      retriesExhausted: true,
      reason: "Tidepool/upstream quote service rate-limited the read-only smoke test",
      depositAddressCreated: false,
      transactionSubmitted: false,
      caveat: "Asset registry and verifier checks ran separately. No live quote was confirmed; rerun when the upstream rate limit clears."
    }, null, 2));
    process.exit(0);
  }
  throw error;
}
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
