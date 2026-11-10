#!/usr/bin/env node
/**
 * Read-only Tidepool Testnet verifier identity/health gate.
 * Checks Tidepool's documented upstream Defuse v0.4.5 WASM SHA-256.
 * Never signs, deposits, submits intents, or transfers tokens.
 */
import assert from "node:assert/strict";

const URL = "https://www.usetidepool.tech/v0/health";
const EXPECTED = {
  network: "testnet",
  verifier: "verifier.tidepool-sandbox.testnet",
  verifierWasmSha256: "a1afab98916d9f213746544dcf8e4e6bdb22c0be6bc5dfbd8ea8814c9922b547",
  verifierRelease: "https://github.com/near/intents/tree/defuse/v0.4.5",
};
const response = await fetch(URL, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
assert.equal(response.ok, true, `Tidepool health returned HTTP ${response.status}`);
const health = await response.json();
for (const [key, value] of Object.entries(EXPECTED)) {
  assert.equal(health[key], value, `Unexpected Tidepool verifier ${key}: ${health[key]}`);
}
assert.equal(health.service, "tidepool", "Unexpected health service");
assert.equal(health.checks?.rpc?.ok, true, "Tidepool Testnet RPC health check failed");
assert.equal(health.checks?.verifier?.ok, true, "Tidepool on-chain verifier code-hash check failed");
assert.equal(health.checks?.verifier?.codeHashHex, EXPECTED.verifierWasmSha256,
  "On-chain verifier code hash does not match the documented Defuse v0.4.5 build");

console.log(JSON.stringify({
  status: "PASS",
  checkedAt: new Date().toISOString(),
  network: health.network,
  verifier: health.verifier,
  verifierWasmSha256: health.verifierWasmSha256,
  verifierRelease: health.verifierRelease,
  rpcHeight: health.checks.rpc.height,
  onChainCodeHash: health.checks.verifier.codeHashHex,
  safety: "Read-only health check. No wallet signature, deposit, intent submission or asset transfer.",
  caveat: "Confirms Tidepool's published Testnet verifier build identity only; not an audit of Tidepool, Handel's execution path, or production parity."
}, null, 2));
