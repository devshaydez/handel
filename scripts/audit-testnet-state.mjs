#!/usr/bin/env node
/**
 * Read-only, dual-RPC audit of the existing Handel Testnet deployments.
 * Makes view_code and call_function requests only. Never submits a transaction.
 *
 * Usage:
 *   node scripts/audit-testnet-state.mjs
 * Optional:
 *   HANDEL_OPTIONS_ACCOUNT, HANDEL_ESCROW_ACCOUNT, HANDEL_AGENT_ACCOUNT
 *   HANDEL_EXPECTED_OPTIONS_SHA256, HANDEL_EXPECTED_ESCROW_SHA256
 *   HANDEL_TESTNET_ASSET_IDS (comma-separated)
 */
import { createHash } from "node:crypto";

const endpoints = [
  "https://rpc.testnet.fastnear.com",
  "https://near-testnet.drpc.org",
];
const optionsAccount = process.env.HANDEL_OPTIONS_ACCOUNT ?? "options.shaydez.testnet";
const escrowAccount = process.env.HANDEL_ESCROW_ACCOUNT ?? "escrow.shaydez.testnet";
const agentAccount = process.env.HANDEL_AGENT_ACCOUNT ?? "handel-agent.shaydez.testnet";
const assetIds = (process.env.HANDEL_TESTNET_ASSET_IDS ??
  "nep141:usdc.tidepool-sandbox.testnet,nep141:wnear.tidepool-sandbox.testnet")
  .split(",").map(value => value.trim()).filter(Boolean);

function assertAccount(value, label) {
  if (!/^[a-z0-9]+([._-][a-z0-9]+)*$/.test(value) || value.length > 64) {
    throw new Error(label + " is not a valid NEAR account ID");
  }
}
for (const [value, label] of [[optionsAccount, "OptionsContract"], [escrowAccount, "Escrow"], [agentAccount, "Agent"]]) {
  assertAccount(value, label);
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
async function rpc(endpoint, method, params) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "handel-readonly-audit", method, params }),
  });
  if (!response.ok) throw new Error(endpoint + " HTTP " + response.status);
  const body = await response.json();
  if (body.error) throw new Error(endpoint + " " + (body.error.message ?? JSON.stringify(body.error)));
  if (!body.result) throw new Error(endpoint + " returned no result");
  return body.result;
}
async function viewCode(endpoint, accountId) {
  const result = await rpc(endpoint, "query", {
    request_type: "view_code", finality: "final", account_id: accountId,
  });
  if (typeof result.code_base64 !== "string" || !result.code_base64) {
    throw new Error("view_code returned no deployed Wasm for " + accountId);
  }
  const wasm = Buffer.from(result.code_base64, "base64");
  return {
    accountId,
    blockHeight: result.block_height,
    blockHash: result.block_hash,
    codeSha256: createHash("sha256").update(wasm).digest("hex"),
    wasmBytes: wasm.length,
  };
}
async function view(endpoint, accountId, methodName, args = {}) {
  const result = await rpc(endpoint, "query", {
    request_type: "call_function", finality: "final", account_id: accountId,
    method_name: methodName,
    args_base64: Buffer.from(JSON.stringify(args), "utf8").toString("base64"),
  });
  if (!Array.isArray(result.result)) throw new Error(methodName + " returned no result bytes");
  return {
    blockHeight: result.block_height,
    blockHash: result.block_hash,
    value: JSON.parse(Buffer.from(result.result).toString("utf8")),
  };
}
async function auditEndpoint(endpoint) {
  const optionsCode = await viewCode(endpoint, optionsAccount);
  const escrowCode = await viewCode(endpoint, escrowAccount);
  const optionsViews = {};
  const escrowViews = {};
  const tokenViews = {};
  const readOptions = async (name, args = {}) => {
    try { optionsViews[name + (Object.keys(args).length ? ":" + JSON.stringify(args) : "")] =
      await view(endpoint, optionsAccount, name, args); }
    catch (error) { optionsViews[name + ":ERROR"] = String(error); }
  };
  const readEscrow = async (name, args = {}) => {
    try { escrowViews[name + (Object.keys(args).length ? ":" + JSON.stringify(args) : "")] =
      await view(endpoint, escrowAccount, name, args); }
    catch (error) { escrowViews[name + ":ERROR"] = String(error); }
  };
  const readToken = async (tokenAccount, methodName, args = {}) => {
    const key = tokenAccount + ":" + methodName;
    try { tokenViews[key] = await view(endpoint, tokenAccount, methodName, args); }
    catch (error) { tokenViews[key + ":ERROR"] = String(error); }
  };
  await Promise.all([
    readOptions("get_owner"),
    readOptions("get_pending_owner"),
    readOptions("get_usdc_asset_id"),
    readOptions("get_position_count"),
    readOptions("get_agent_policy", { agent_id: agentAccount }),
    readOptions("get_agent_execution_mode", { agent_id: agentAccount }),
    ...assetIds.flatMap(assetId => [
      readOptions("get_asset", { asset_id: assetId }),
      readOptions("get_escrow_token_account", { asset_id: assetId }),
    ]),
    readEscrow("get_owner"),
    readEscrow("get_pending_owner"),
  ]);
  // Resolve each Handel asset ID to its configured NEP-141 token account, then
  // query the token contract directly for Escrow's registration and balance.
  const tokenAccounts = assetIds.map(assetId => {
    const key = "get_escrow_token_account:" + JSON.stringify({ asset_id: assetId });
    const response = optionsViews[key];
    return response && typeof response.value === "string" ? response.value : null;
  }).filter(Boolean);
  await Promise.all([...new Set(tokenAccounts)].flatMap(tokenAccount => [
    readToken(tokenAccount, "ft_metadata"),
    readToken(tokenAccount, "storage_balance_of", { account_id: escrowAccount }),
    readToken(tokenAccount, "ft_balance_of", { account_id: escrowAccount }),
  ]));
  return { endpoint, optionsCode, escrowCode, optionsViews, escrowViews, tokenViews };
}
const results = await Promise.all(endpoints.map(auditEndpoint));
const comparable = result => JSON.stringify(canonical({
  // Finalized heads may differ by a few blocks across independent providers.
  // Compare contract bytes and view values, not provider-local block metadata.
  optionsCode: { codeSha256: result.optionsCode.codeSha256, wasmBytes: result.optionsCode.wasmBytes },
  escrowCode: { codeSha256: result.escrowCode.codeSha256, wasmBytes: result.escrowCode.wasmBytes },
  optionsViews: Object.fromEntries(Object.entries(result.optionsViews).map(([key, item]) =>
    [key, typeof item === "object" && item !== null && "value" in item ? item.value : item])),
  escrowViews: Object.fromEntries(Object.entries(result.escrowViews).map(([key, item]) =>
    [key, typeof item === "object" && item !== null && "value" in item ? item.value : item])),
  tokenViews: Object.fromEntries(Object.entries(result.tokenViews).map(([key, item]) =>
    [key, typeof item === "object" && item !== null && "value" in item ? item.value : item])),
}));
const agrees = comparable(results[0]) === comparable(results[1]);
const expectedOptions = process.env.HANDEL_EXPECTED_OPTIONS_SHA256;
const expectedEscrow = process.env.HANDEL_EXPECTED_ESCROW_SHA256;
const hashesMatch = result =>
  (!expectedOptions || result.optionsCode.codeSha256 === expectedOptions) &&
  (!expectedEscrow || result.escrowCode.codeSha256 === expectedEscrow);
const rpcErrors = results.flatMap(result =>
  [...Object.entries(result.optionsViews), ...Object.entries(result.escrowViews), ...Object.entries(result.tokenViews)]
    .filter(([key]) => key.endsWith(":ERROR"))
    .map(([key, error]) => ({ endpoint: result.endpoint, key, error })));
const report = {
  mode: "READ_ONLY",
  transactionsSubmitted: 0,
  rpcEndpoints: endpoints,
  independentRpcAgreement: agrees,
  expectedHashesSupplied: Boolean(expectedOptions || expectedEscrow),
  expectedHashesMatchBothRpcs: results.every(hashesMatch),
  rpcViewErrors: rpcErrors,
  endpoints: results,
  limitations: [
    "Escrow controller and payout-reconciler state have no public view methods in the current contract ABI; this script does not infer them.",
    "A successful RPC quorum is independent-provider corroboration, not a cryptographic light-client proof.",
    "The token reads report Escrow's own NEP-141 storage registration and token balance; they do not prove user wallet balances or transfer history.",
  ],
};
process.stdout.write(JSON.stringify(report, null, 2) + "\n");
if (!agrees || !results.every(hashesMatch) || rpcErrors.length > 0) process.exitCode = 2;
