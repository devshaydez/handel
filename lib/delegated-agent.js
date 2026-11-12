import { Account, JsonRpcProvider, KeyPair, teraToGas } from "near-api-js";

const DELEGATED_METHODS = [
  "agent_begin_collateral_lock",
  "agent_create_call",
  "agent_create_put",
  "agent_register_escrow_position",
];
const DEFAULT_OPTIONS = "options.shaydez.testnet";
const DEFAULT_RPC = "https://rpc.testnet.fastnear.com";
const MAX_ALLOWANCE = 1_000_000_000_000_000_000_000_000n;

function required(name) {
  const value = process.env[name];
  if (!value?.trim()) throw new Error(name + " is not configured");
  return value.trim();
}
function validAccount(value) {
  return typeof value === "string" && value.length >= 2 && value.length <= 64 &&
    /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(value);
}
function positive(value, label) {
  if (typeof value !== "string" || !/^[1-9][0-9]{0,77}$/.test(value)) throw new Error(label + " must be a positive base-unit integer string");
  return BigInt(value);
}
async function rpc(rpcUrl, method, params) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "handel-delegated-agent", method, params }),
  });
  if (!response.ok) throw new Error("NEAR RPC returned HTTP " + response.status);
  const body = await response.json();
  if (body.error) throw new Error(body.error.message || "NEAR RPC request failed");
  return body.result;
}
async function viewAt(rpcUrl, contractId, methodName, args, blockId) {
  const result = await rpc(rpcUrl, "query", {
    request_type: "call_function",
    ...(blockId ? { block_id: blockId } : { finality: "final" }),
    account_id: contractId,
    method_name: methodName,
    args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
  });
  if (!Array.isArray(result?.result) || !result.block_hash) throw new Error("NEAR view returned no finalized result: " + methodName);
  return {
    value: JSON.parse(Buffer.from(result.result).toString("utf8")),
    blockHash: result.block_hash,
    blockHeight: result.block_height || 0,
  };
}
async function policyAndMode(config) {
  const policy = await viewAt(config.rpcUrl, config.contractId, "get_agent_policy", { agent_id: config.accountId });
  const mode = await viewAt(config.rpcUrl, config.contractId, "get_agent_execution_mode", { agent_id: config.accountId }, policy.blockHash);
  if (policy.blockHeight !== mode.blockHeight) throw new Error("Agent policy and execution mode are not pinned to the same finalized block.");
  return { policy: policy.value, mode: mode.value };
}
async function assertRestrictedKey(config, expectedMethods) {
  const pair = KeyPair.fromString(config.privateKey);
  const publicKey = pair.getPublicKey().toString();
  const result = await rpc(config.rpcUrl, "query", {
    request_type: "view_access_key_list", finality: "final", account_id: config.accountId,
  });
  const entry = result?.keys?.find(item => item.public_key === publicKey);
  if (!entry) throw new Error("Configured agent key is not installed on the agent account.");
  const permission = entry.access_key?.permission;
  const fc = permission && typeof permission === "object" ? permission.FunctionCall : null;
  if (!fc || fc.receiver_id !== config.contractId) {
    throw new Error("Agent signer must be a restricted FunctionCall key scoped to the OptionsContract; FullAccess keys are refused.");
  }
  const actual = Array.isArray(fc.method_names) ? [...fc.method_names].sort() : [];
  const expected = [...expectedMethods].sort();
  if (actual.length !== expected.length || actual.some((method, index) => method !== expected[index])) {
    throw new Error("Agent key method allowlist must match the exact delegated method set.");
  }
  const allowance = typeof fc.allowance === "string" ? BigInt(fc.allowance) : 0n;
  const maxAllowance = process.env.HANDEL_AGENT_MAX_KEY_ALLOWANCE_YOCTO
    ? BigInt(process.env.HANDEL_AGENT_MAX_KEY_ALLOWANCE_YOCTO) : MAX_ALLOWANCE;
  if (allowance <= 0n || allowance > maxAllowance) throw new Error("Agent key must have a finite positive NEAR allowance within the configured ceiling.");
  return publicKey;
}
function transactionHash(outcome) {
  return outcome?.transaction?.hash || outcome?.transaction_outcome?.id || outcome?.transaction_outcome?.transaction_hash || "";
}
function returnedPositionId(outcome) {
  const encoded = outcome?.status?.SuccessValue;
  if (typeof encoded !== "string" || !encoded) throw new Error("OptionsContract did not return a position ID.");
  const value = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
  if (!(Number.isSafeInteger(value) && value >= 0) && !(typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value))) {
    throw new Error("OptionsContract returned an invalid position ID.");
  }
  return String(value);
}
function config() {
  const accountId = required("NEAR_AGENT_ACCOUNT_ID");
  const privateKey = required("NEAR_AGENT_DELEGATED_FUNCTION_CALL_PRIVATE_KEY");
  if (!accountId.endsWith(".testnet") || !privateKey.startsWith("ed25519:")) {
    throw new Error("Delegated agent signer must use a dedicated NEAR Testnet account and ed25519 function-call key.");
  }
  const contractId = process.env.HANDEL_OPTIONS_CONTRACT_ID || DEFAULT_OPTIONS;
  const rpcUrl = process.env.NEAR_RPC_URL || DEFAULT_RPC;
  if (!validAccount(contractId) || !rpcUrl.startsWith("https://")) throw new Error("Delegated Testnet RPC or OptionsContract configuration is invalid.");
  return { accountId, privateKey, contractId, rpcUrl };
}
export async function submitDelegatedTrade(input) {
  const cfg = config();
  if (!validAccount(input?.principal) || !validAccount(input?.holder)) throw new Error("Principal and holder must be valid NEAR account IDs.");
  if (input.principal === cfg.accountId) throw new Error("Agent account must be distinct from the policy principal.");
  if (input.type !== "Call" && input.type !== "Put") throw new Error("Only Call and Put options are supported.");
  const assetId = process.env.HANDEL_DEMO_UNDERLYING_ASSET_ID || "nep141:wnear.tidepool-sandbox.testnet";
  if (input.assetId !== assetId) throw new Error("Only the configured Tidepool Testnet synthetic underlying is enabled.");
  const quantity = String(input.quantity);
  const strike = String(input.strike);
  const expiryNs = String(input.expiryNs);
  const premium = process.env.HANDEL_DEMO_PREMIUM_FIXTURE || "5000000";
  const quantityN = positive(quantity, "underlying amount");
  const strikeN = positive(strike, "strike amount");
  const premiumN = positive(premium, "demo premium");
  const expiryN = positive(expiryNs, "expiry");
  const maxU128 = (1n << 128n) - 1n;
  if ([quantityN, strikeN, premiumN].some(value => value > maxU128)) throw new Error("Trade amount exceeds the contract's u128 range.");
  if (expiryN <= BigInt(Date.now()) * 1_000_000n) throw new Error("Option expiry must be in the future.");

  const authority = await policyAndMode(cfg);
  const policy = authority.policy;
  if (!policy || policy.enabled !== true || policy.principal !== input.principal) throw new Error("Agent policy is absent, revoked, or belongs to a different principal.");
  if (authority.mode !== "Delegated") throw new Error("On-chain agent mode must be Delegated.");
  if (!Array.isArray(policy.allowed_assets) || !policy.allowed_assets.includes(assetId)) throw new Error("Underlying asset is not allowlisted by the on-chain policy.");
  if (quantityN > BigInt(policy.max_underlying_amount)) throw new Error("Underlying amount exceeds the on-chain cap.");
  if (premiumN > BigInt(policy.max_premium_usdc)) throw new Error("Demo premium exceeds the on-chain cap.");
  if (input.type === "Put" && strikeN > BigInt(policy.max_collateral_usdc)) throw new Error("Put collateral exceeds the on-chain cap.");
  if (expiryN > BigInt(policy.expires_at_ns)) throw new Error("Option expiry exceeds the agent policy expiry.");

  const publicKey = await assertRestrictedKey(cfg, DELEGATED_METHODS);
  const provider = new JsonRpcProvider({ url: cfg.rpcUrl });
  const signer = new Account(cfg.accountId, provider, cfg.privateKey);
  const method = input.type === "Call" ? "agent_create_call" : "agent_create_put";
  const created = await signer.callFunction({
    contractId: cfg.contractId,
    methodName: method,
    args: {
      holder: input.holder,
      asset_id: assetId,
      underlying_amount: quantity,
      strike_amount_usdc: strike,
      expiry_ns: expiryNs,
      premium_amount_usdc: premium,
    },
    gas: teraToGas("80"),
    deposit: 0n,
  });
  const createHash = transactionHash(created);
  if (!createHash) throw new Error("Agent create call returned no transaction hash.");
  const positionId = returnedPositionId(created);

  // Re-check revocation and key scope before the second transaction.
  const afterCreate = await policyAndMode(cfg);
  if (!afterCreate.policy || afterCreate.policy.enabled !== true ||
      afterCreate.policy.principal !== input.principal || afterCreate.mode !== "Delegated") {
    throw new Error("Agent policy was revoked or changed after creation; position " + positionId + " remains pending collateral.");
  }
  await assertRestrictedKey(cfg, DELEGATED_METHODS);
  const registered = await signer.callFunction({
    contractId: cfg.contractId,
    methodName: "agent_register_escrow_position",
    args: { position_id: Number(positionId) },
    gas: teraToGas("80"),
    deposit: 0n,
  });
  const registerHash = transactionHash(registered);
  if (!registerHash) throw new Error("Escrow registration call returned no transaction hash; position " + positionId + " remains pending.");

  const positionResult = await viewAt(cfg.rpcUrl, cfg.contractId, "get_position", { id: Number(positionId) });
  const position = positionResult.value;
  if (!position || position.writer !== input.principal || position.holder !== input.holder ||
      position.asset_id !== assetId || String(position.escrow_position_id ?? "") === "" ||
      position.escrow_registration_pending === true) {
    throw new Error("Escrow registration is not confirmed. Position " + positionId + " remains pending; inspect transaction " + registerHash);
  }
  return {
    status: "awaiting_principal_collateral",
    agentId: cfg.accountId,
    agentPublicKey: publicKey,
    principal: input.principal,
    positionId,
    escrowPositionId: String(position.escrow_position_id),
    createTransactionHash: createHash,
    registrationTransactionHash: registerHash,
    nextAction: "principal_signs_collateral_transfer",
    pricingMode: "demo_fixture",
    network: "testnet",
    collateralTransferAuthorized: false,
    premiumPaymentAuthorized: false,
  };
}
