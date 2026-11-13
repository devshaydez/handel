#!/usr/bin/env node
/**
 * Read-only, dual-RPC audit of the existing Handel Testnet deployments.
 * Makes view_code and call_function requests only. Never submits a transaction.
 *
 * Usage:
 *   node scripts/audit-testnet-state.mjs
 * Optional:
 *   HANDEL_OPTIONS_ACCOUNT, HANDEL_ESCROW_ACCOUNT, HANDEL_AGENT_ACCOUNT
 *   HANDEL_PRINCIPAL_ACCOUNT (balance/registration report only)
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
const principalAccount = process.env.HANDEL_PRINCIPAL_ACCOUNT ?? "shaydez.testnet";
const assetIds = (process.env.HANDEL_TESTNET_ASSET_IDS ??
  "nep141:usdc.tidepool-sandbox.testnet,nep141:wnear.tidepool-sandbox.testnet")
  .split(",").map(value => value.trim()).filter(Boolean);
// Documented token accounts from config/testnet-assets.tidepool.json. Used as a
// fallback provenance only when the contract mapping view is unavailable, never
// as a substitute for a successful contract read.
const documentedTokenAccounts = Object.fromEntries(assetIds.map(assetId => [
  assetId, assetId.startsWith("nep141:") ? assetId.slice("nep141:".length) : null,
]));
const storageReportAccounts = [escrowAccount, optionsAccount, agentAccount, principalAccount];

function assertAccount(value, label) {
  if (!/^[a-z0-9]+([._-][a-z0-9]+)*$/.test(value) || value.length > 64) {
    throw new Error(label + " is not a valid NEAR account ID");
  }
}
for (const [value, label] of [[optionsAccount, "OptionsContract"], [escrowAccount, "Escrow"], [agentAccount, "Agent"], [principalAccount, "Principal"]]) {
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
  // Contract execution failures are returned inside result.error, not as a
  // top-level JSON-RPC error. Treating them as "no result bytes" would hide a
  // real MethodNotFound or panic, so surface them verbatim.
  if (body.result.error) throw new Error(endpoint + " execution error: " + body.result.error);
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
  const text = Buffer.from(result.result).toString("utf8");
  // An empty byte array is a contract that returned nothing, which is a valid
  // JSON `null` only for methods declared to return Option. Do not coerce it.
  return {
    blockHeight: result.block_height,
    blockHash: result.block_hash,
    bytes: result.result.length,
    value: text ? JSON.parse(text) : null,
  };
}
async function auditEndpoint(endpoint) {
  const optionsCode = await viewCode(endpoint, optionsAccount);
  const escrowCode = await viewCode(endpoint, escrowAccount);
  const optionsViews = {};
  const escrowViews = {};
  const tokenViews = {};
  const deployedCodeGaps = [];
  const recordError = (bucket, key, error) => {
    const message = String(error);
    bucket[key + ":ERROR"] = message;
    if (message.includes("MethodResolveError(MethodNotFound)")) {
      deployedCodeGaps.push({ endpoint, key, error: message });
    }
  };
  const readOptions = async (name, args = {}) => {
    const key = name + (Object.keys(args).length ? ":" + JSON.stringify(args) : "");
    try { optionsViews[key] = await view(endpoint, optionsAccount, name, args); }
    catch (error) { recordError(optionsViews, name + (Object.keys(args).length ? ":" + JSON.stringify(args) : ""), error); }
  };
  const readEscrow = async (name, args = {}) => {
    const key = name + (Object.keys(args).length ? ":" + JSON.stringify(args) : "");
    try { escrowViews[key] = await view(endpoint, escrowAccount, name, args); }
    catch (error) { recordError(escrowViews, name + (Object.keys(args).length ? ":" + JSON.stringify(args) : ""), error); }
  };
  const readToken = async (tokenAccount, methodName, args = {}) => {
    const key = tokenAccount + ":" + methodName + (Object.keys(args).length ? ":" + JSON.stringify(args) : "");
    try { tokenViews[key] = await view(endpoint, tokenAccount, methodName, args); }
    catch (error) { recordError(tokenViews, key, error); }
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
    readEscrow("get_demo_self_trade"),
  ]);
  const positionCount = optionsViews["get_position_count"];
  if (positionCount && typeof positionCount.value === "number" && positionCount.value > 0) {
    await readOptions("get_positions_page", { from_id: 0, limit: Math.min(50, positionCount.value) });
  }
  // Resolve each Handel asset ID to its configured NEP-141 token account, then
  // query the token contract directly for Escrow's registration and balance.
  const tokenAccountProvenance = {};
  const tokenAccounts = new Set();
  for (const assetId of assetIds) {
    const response = optionsViews["get_escrow_token_account:" + JSON.stringify({ asset_id: assetId })];
    if (response && typeof response.value === "string") {
      tokenAccounts.add(response.value);
      tokenAccountProvenance[assetId] = { tokenAccount: response.value, source: "options.get_escrow_token_account" };
    } else if (documentedTokenAccounts[assetId]) {
      tokenAccounts.add(documentedTokenAccounts[assetId]);
      tokenAccountProvenance[assetId] = {
        tokenAccount: documentedTokenAccounts[assetId],
        source: "config/testnet-assets.tidepool.json (contract mapping view unavailable)",
      };
    }
  }
  await Promise.all([...tokenAccounts].flatMap(tokenAccount => [
    readToken(tokenAccount, "ft_metadata"),
    ...storageReportAccounts.flatMap(account => [
      readToken(tokenAccount, "storage_balance_of", { account_id: account }),
      readToken(tokenAccount, "ft_balance_of", { account_id: account }),
    ]),
  ]));
  // Restricted-access-key evidence for the delegated agent account. Read-only.
  let agentAccessKeys;
  try {
    agentAccessKeys = await rpc(endpoint, "query", {
      request_type: "view_access_key_list", finality: "final", account_id: agentAccount,
    });
  } catch (error) {
    agentAccessKeys = { ERROR: String(error) };
  }
  return {
    endpoint,
    optionsCode,
    escrowCode,
    optionsViews,
    escrowViews,
    tokenViews,
    tokenAccountProvenance,
    deployedCodeGaps,
    agentAccessKeys,
  };
}
const results = await Promise.all(endpoints.map(auditEndpoint));
// Provider-local block metadata and endpoint names are not part of observable
// state: strip them so agreement compares values and execution outcomes only.
const comparableValue = (item, endpoint) => {
  if (typeof item === "string") return item.split(endpoint + " ").join("");
  if (typeof item === "object" && item !== null && "value" in item) return item.value;
  return item;
};
const comparable = result => JSON.stringify(canonical({
  optionsCode: { codeSha256: result.optionsCode.codeSha256, wasmBytes: result.optionsCode.wasmBytes },
  escrowCode: { codeSha256: result.escrowCode.codeSha256, wasmBytes: result.escrowCode.wasmBytes },
  optionsViews: Object.fromEntries(Object.entries(result.optionsViews).map(([key, item]) =>
    [key, comparableValue(item, result.endpoint)])),
  escrowViews: Object.fromEntries(Object.entries(result.escrowViews).map(([key, item]) =>
    [key, comparableValue(item, result.endpoint)])),
  tokenViews: Object.fromEntries(Object.entries(result.tokenViews).map(([key, item]) =>
    [key, comparableValue(item, result.endpoint)])),
  agentAccessKeys: result.agentAccessKeys.keys
    ? result.agentAccessKeys.keys.map(entry => {
      const permission = entry.access_key.permission;
      return permission === "FullAccess"
        ? { publicKey: entry.public_key, permission }
        : { publicKey: entry.public_key, permission };
    }).sort((a, b) => a.publicKey.localeCompare(b.publicKey))
    : result.agentAccessKeys,
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
const methodGaps = [...new Set(results.flatMap(result =>
  result.deployedCodeGaps.map(gap => gap.key.split(":")[0] + "(" + gap.key.split(":").slice(1).join(":") + ")")))];
const agentKeys = results[0].agentAccessKeys.keys?.map(entry => ({
  publicKey: entry.public_key,
  permission: entry.access_key.permission,
})) ?? [];
const fullAccessAgentKeys = agentKeys.filter(key => key.permission === "FullAccess");
const report = {
  mode: "READ_ONLY",
  transactionsSubmitted: 0,
  rpcEndpoints: endpoints,
  independentRpcAgreement: agrees,
  expectedHashesSupplied: Boolean(expectedOptions || expectedEscrow),
  expectedHashesMatchBothRpcs: results.every(hashesMatch),
  deployedCodeGapMethods: methodGaps,
  rpcViewErrors: rpcErrors,
  agentAccessKeySummary: {
    total: agentKeys.length,
    fullAccessKeys: fullAccessAgentKeys.length,
    fullAccessPublicKeys: fullAccessAgentKeys.map(key => key.publicKey),
    functionCallKeys: agentKeys.filter(key => key.permission !== "FullAccess").map(key => ({
      publicKey: key.publicKey,
      receiverId: key.permission.FunctionCall.receiver_id,
      methodNames: key.permission.FunctionCall.method_names,
      allowance: key.permission.FunctionCall.allowance,
    })),
  },
  endpoints: results,
  limitations: [
    "Escrow exposes no safe public position-ID enumeration; this script does not guess its independent ID space from OptionsContract IDs.",
    "Escrow controller, paused state and payout-reconciler configuration have no public view methods in the current contract ABI; this script does not infer them.",
    "A successful RPC quorum is independent-provider corroboration, not a cryptographic light-client proof.",
    "Token reads report storage registration and balances for the named accounts only; they do not prove transfer history.",
    "A deployed-code gap means the view exists in the repository source but not in the Wasm currently deployed; closing it requires an owner-authorized Wasm upgrade, not a script change.",
  ],
};
process.stdout.write(JSON.stringify(report, null, 2) + "\n");
if (!agrees || !results.every(hashesMatch) || rpcErrors.length > 0) process.exitCode = 2;
