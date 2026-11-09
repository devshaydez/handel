#!/usr/bin/env node
/**
 * Read-only verification of Tidepool's NEAR Testnet NEP-141 assets.
 *
 * Uses two independently operated RPC endpoints and the live Tidepool registry.
 * It never submits transactions, registers storage, or transfers tokens.
 */
import fs from "node:fs";
import process from "node:process";

const CONFIG_PATH = new URL("../config/testnet-assets.tidepool.json", import.meta.url);
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
const RPCS = [
  "https://rpc.testnet.near.org",
  "https://rpc.testnet.fastnear.com",
];
const EXPECTED_OWNER = "privacei.testnet";
const EXPECTED_MINTERS = ["tidepool-sandbox.testnet", "maker.tidepool-sandbox.testnet"];
const TIMEOUT_MS = 20_000;
const RETRIES = 3;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function requestJson(url, body) {
  let lastError;
  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      assert(response.ok, `${url} returned HTTP ${response.status}`);
      const payload = await response.json();
      assert(!payload.error, `${url} RPC error: ${JSON.stringify(payload.error)}`);
      return payload.result;
    } catch (error) {
      lastError = error;
      if (attempt < RETRIES) await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
    }
  }
  throw new Error(`${url} failed after ${RETRIES} attempts: ${lastError?.message ?? lastError}`);
}

function decodeFunctionResult(result) {
  assert(Array.isArray(result?.result), "call_function response has no byte-array result");
  const decoded = new TextDecoder().decode(Uint8Array.from(result.result));
  try {
    return JSON.parse(decoded);
  } catch {
    throw new Error(`Contract view returned non-JSON data: ${decoded}`);
  }
}

async function callView(rpc, accountId, methodName, args = {}) {
  const result = await requestJson(rpc, {
    jsonrpc: "2.0",
    id: `handel-${methodName}`,
    method: "query",
    params: {
      request_type: "call_function",
      finality: "final",
      account_id: accountId,
      method_name: methodName,
      args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
    },
  });
  return decodeFunctionResult(result);
}

async function accountCodeHash(rpc, accountId) {
  const result = await requestJson(rpc, {
    jsonrpc: "2.0",
    id: "handel-view-account",
    method: "query",
    params: { request_type: "view_account", finality: "final", account_id: accountId },
  });
  assert(typeof result?.code_hash === "string", `No deployed code hash for ${accountId}`);
  return result.code_hash;
}

async function verifyRpc(rpc, liveRegistry) {
  const report = [];
  for (const token of config.tokens) {
    const live = liveRegistry.find((item) => item.assetId === token.assetId);
    assert(live, `Live Tidepool registry no longer lists ${token.assetId}`);
    assert(live.contractAddress === token.nep141Account, `Live contract account changed for ${token.symbol}`);
    assert(live.decimals === token.decimals, `Live registry decimals changed for ${token.symbol}`);

    const [metadata, owner, rootMinter, makerMinter, codeHash, storageBounds] = await Promise.all([
      callView(rpc, token.nep141Account, "ft_metadata"),
      callView(rpc, token.nep141Account, "owner_id"),
      callView(rpc, token.nep141Account, "is_minter", { account_id: EXPECTED_MINTERS[0] }),
      callView(rpc, token.nep141Account, "is_minter", { account_id: EXPECTED_MINTERS[1] }),
      accountCodeHash(rpc, token.nep141Account),
      callView(rpc, token.nep141Account, "storage_balance_bounds"),
    ]);

    assert(metadata.symbol === token.symbol, `${token.symbol}: on-chain symbol mismatch (${metadata.symbol})`);
    assert(metadata.decimals === token.decimals, `${token.symbol}: on-chain decimals mismatch (${metadata.decimals})`);
    assert(typeof metadata.name === "string" && metadata.name.includes("no value"),
      `${token.symbol}: unexpected token name; expected explicit no-value test token`);
    assert(owner === EXPECTED_OWNER, `${token.symbol}: unexpected owner (${owner})`);
    assert(rootMinter === true, `${token.symbol}: Tidepool root is not an authorized minter`);
    assert(makerMinter === true, `${token.symbol}: Tidepool maker is not an authorized minter`);
    assert(storageBounds && typeof storageBounds.min === "string" && BigInt(storageBounds.min) > 0n,
      `${token.symbol}: invalid NEP-145 minimum storage balance`);

    const registeredAccounts = {};
    for (const accountId of [EXPECTED_OWNER, ...EXPECTED_MINTERS]) {
      registeredAccounts[accountId] = await callView(rpc, token.nep141Account, "storage_balance_of", {
        account_id: accountId,
      });
    }

    report.push({
      symbol: token.symbol,
      account: token.nep141Account,
      decimals: metadata.decimals,
      owner,
      minters: { [EXPECTED_MINTERS[0]]: rootMinter, [EXPECTED_MINTERS[1]]: makerMinter },
      codeHash,
      storageBounds,
      providerAccountsRegistered: Object.fromEntries(
        Object.entries(registeredAccounts).map(([accountId, balance]) => [accountId, balance !== null]),
      ),
      metadataName: metadata.name,
    });
  }

  const hashes = [...new Set(report.map((item) => item.codeHash))];
  assert(hashes.length === 1, `Tidepool NEP-141 code hashes differ across assets: ${hashes.join(", ")}`);
  return { rpc, blockFinality: "final", tokens: report, sharedCodeHash: hashes[0] };
}

async function main() {
  const registryResponse = await fetch("https://www.usetidepool.tech/v0/tokens", {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  assert(registryResponse.ok, `Tidepool registry returned HTTP ${registryResponse.status}`);
  const liveRegistry = await registryResponse.json();
  assert(Array.isArray(liveRegistry), "Tidepool registry response is not an array");

  const results = await Promise.all(RPCS.map((rpc) => verifyRpc(rpc, liveRegistry)));
  const comparable = (result) => JSON.stringify(result.tokens.map((token) => ({
    symbol: token.symbol,
    account: token.account,
    decimals: token.decimals,
    owner: token.owner,
    minters: token.minters,
    codeHash: token.codeHash,
    storageBounds: token.storageBounds,
  })));
  assert(comparable(results[0]) === comparable(results[1]),
    "Independent RPC endpoints returned different final token state");

  const escrowAccount = process.env.HANDEL_ESCROW_ACCOUNT;
  let escrowStorage = "not_checked_no_HANDEL_ESCROW_ACCOUNT";
  if (escrowAccount) {
    assert(escrowAccount.endsWith(".testnet"), "HANDEL_ESCROW_ACCOUNT must be a .testnet account");
    escrowStorage = {};
    for (const token of config.tokens) {
      const [a, b] = await Promise.all(RPCS.map((rpc) =>
        callView(rpc, token.nep141Account, "storage_balance_of", { account_id: escrowAccount }),
      ));
      assert(JSON.stringify(a) === JSON.stringify(b), `RPC storage balance disagreement for ${token.symbol}`);
      escrowStorage[token.symbol] = a;
    }
  }

  console.log(JSON.stringify({
    status: "PASS",
    checkedAt: new Date().toISOString(),
    registry: "https://www.usetidepool.tech/v0/tokens",
    rpcResults: results,
    handelEscrowStorage: escrowStorage,
    safety: "Read-only. No transactions, storage deposits, or token transfers were submitted.",
    caveat: "A passing result verifies token metadata and provider authority state, not provider trustworthiness or Handel's production custody/settlement safety.",
  }, null, 2));
}

main().catch((error) => {
  console.error(`Testnet asset verification FAILED: ${error.stack ?? error.message}`);
  process.exitCode = 1;
});
