import { InferenceClient } from "@nearai/inference-sdk/node";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Account, JsonRpcProvider, KeyPair, teraToGas } from "near-api-js";
import { submitDelegatedTrade } from "./delegated-agent.js";
import { verifyMessage } from "near-api-js/nep413";

let client;
const json = (res, status, value) => {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(value));
};
function required(name) {
  const value = process.env[name];
  if (!value?.trim()) throw new Error(name + " is not configured");
  return value.trim();
}
function intEnv(name, fallback) {
  const value = process.env[name];
  if (!value) return fallback;
  if (!/^[1-9][0-9]*$/.test(value)) throw new Error(name + " must be a positive integer");
  return Number(value);
}
function getClient() {
  if (!client) client = new InferenceClient({ apiKey: required("NEARAI_API_KEY"), e2ee: false });
  return client;
}
function parseBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body);
  return {};
}
function validAccount(value) {
  return typeof value === "string" && value.length >= 2 && value.length <= 64 &&
    /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(value);
}
function positiveString(value, field) {
  if (typeof value !== "string" || !/^[1-9][0-9]{0,77}$/.test(value)) throw new Error(field + " must be a positive base-unit integer string");
  return value;
}
async function viewContract(rpcUrl, contractId, methodName, args) {
  const encoded = Buffer.from(JSON.stringify(args)).toString("base64");
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "handel-policy", method: "query",
      params: { request_type: "call_function", finality: "final", account_id: contractId,
        method_name: methodName, args_base64: encoded } }),
  });
  if (!response.ok) throw new Error("NEAR RPC returned HTTP " + response.status);
  const body = await response.json();
  if (body.error || !body.result?.result) throw new Error("Unable to read on-chain contract state: " + methodName);
  return JSON.parse(Buffer.from(body.result.result).toString("utf8"));
}
async function assertScopedFunctionCallKey(accountId, privateKey, contractId, rpcUrl, expectedMethods) {
  const publicKey = KeyPair.fromString(privateKey).getPublicKey().toString();
  const response = await fetch(rpcUrl, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "handel-agent-key-scope", method: "query",
      params: { request_type: "view_access_key_list", finality: "final", account_id: accountId } }),
  });
  if (!response.ok) throw new Error("Unable to verify the agent access-key permissions.");
  const body = await response.json();
  if (body.error || !Array.isArray(body.result?.keys)) throw new Error("Agent access-key list is unavailable.");
  const key = body.result.keys.find(entry => entry.public_key === publicKey);
  const permission = key?.access_key?.permission;
  const fc = permission && typeof permission === "object" ? permission.FunctionCall : null;
  if (!fc || fc.receiver_id !== contractId) {
    throw new Error("Agent signer must be a restricted FunctionCall key scoped to OptionsContract. FullAccess keys are refused.");
  }
  const actual = Array.isArray(fc.method_names) ? [...fc.method_names].sort() : [];
  const expected = [...expectedMethods].sort();
  if (actual.length !== expected.length || actual.some((method, index) => method !== expected[index])) {
    throw new Error("Agent key must have the exact approved method allowlist.");
  }
  const allowance = typeof fc.allowance === "string" ? BigInt(fc.allowance) : 0n;
  const ceiling = process.env.HANDEL_AGENT_MAX_KEY_ALLOWANCE_YOCTO
    ? BigInt(process.env.HANDEL_AGENT_MAX_KEY_ALLOWANCE_YOCTO) : 1000000000000000000000000n;
  if (allowance <= 0n || allowance > ceiling) throw new Error("Agent key requires a finite NEAR allowance within the configured ceiling.");
  return publicKey;
}
function agentConfig() {
  const accountId = required("NEAR_AGENT_ACCOUNT_ID");
  const privateKey = required("NEAR_AGENT_PROPOSAL_FUNCTION_CALL_PRIVATE_KEY");
  if (!accountId.endsWith(".testnet") || !privateKey.startsWith("ed25519:")) {
    throw new Error("NEAR agent must use a Testnet account and an ed25519 key");
  }
  const contractId = process.env.VITE_HANDEL_OPTIONS_CONTRACT_ID || process.env.HANDEL_OPTIONS_CONTRACT_ID || "options.shaydez.testnet";
  const rpcUrl = process.env.NEAR_RPC_URL || "https://rpc.testnet.near.org";
  return { accountId, privateKey, contractId, rpcUrl };
}
async function assertAgentPolicy(input, config) {
  const policy = await viewContract(config.rpcUrl, config.contractId, "get_agent_policy", { agent_id: config.accountId });
  if (!policy) throw new Error("Agent policy is not registered on OptionsContract. Register the agent from the principal account first.");
  if (policy.principal !== input.principal) throw new Error("Signed wallet must be the principal account registered for this agent.");
  if (policy.enabled !== true || BigInt(policy.expires_at_ns) <= BigInt(Date.now()) * 1000000n) throw new Error("Agent policy is disabled or expired.");
  const mode = await viewContract(config.rpcUrl, config.contractId, "get_agent_execution_mode", { agent_id: config.accountId });
  if (mode !== "ManualApproval") throw new Error("Agent must remain in ManualApproval mode.");
  if (!Array.isArray(policy.allowed_assets) || !policy.allowed_assets.includes(input.assetId)) throw new Error("The proposal asset is not allowed by the on-chain agent policy.");
  if (BigInt(input.quantity) > BigInt(policy.max_underlying_amount)) throw new Error("Proposal exceeds the on-chain underlying limit.");
  if (BigInt(input.premium) > BigInt(policy.max_premium_usdc)) throw new Error("Proposal exceeds the on-chain premium limit.");
  if (input.kind === "Put" && BigInt(input.strike) > BigInt(policy.max_collateral_usdc)) throw new Error("Put collateral exceeds the on-chain collateral limit.");
  if (BigInt(input.expiryNs) > BigInt(policy.expires_at_ns)) throw new Error("Proposal expiry exceeds the agent policy expiry.");
  return policy;
}
async function submitOnChainAgentProposal(input) {
  const { accountId, privateKey, contractId, rpcUrl } = agentConfig();
  const proposalId = input.proposalId;
  const policy = await viewContract(rpcUrl, contractId, "get_agent_policy", { agent_id: accountId });
  if (!policy) throw new Error("Agent policy is not registered on OptionsContract. Register the agent from the principal account first.");
  if (policy.principal !== input.principal) throw new Error("Signed wallet must be the principal account registered for this agent.");
  if (policy.enabled !== true || BigInt(policy.expires_at_ns) <= BigInt(Date.now()) * 1000000n) {
    throw new Error("Agent policy is disabled or expired.");
  }
  const mode = await viewContract(rpcUrl, contractId, "get_agent_execution_mode", { agent_id: accountId });
  if (mode !== "ManualApproval") throw new Error("Agent must remain in ManualApproval mode.");
  if (!Array.isArray(policy.allowed_assets) || !policy.allowed_assets.includes(input.assetId)) {
    throw new Error("The proposal asset is not allowed by the on-chain agent policy.");
  }
  if (BigInt(input.quantity) > BigInt(policy.max_underlying_amount)) throw new Error("Proposal exceeds the on-chain underlying limit.");
  if (BigInt(input.premium) > BigInt(policy.max_premium_usdc)) throw new Error("Proposal exceeds the on-chain premium limit.");
  if (input.kind === "Put" && BigInt(input.strike) > BigInt(policy.max_collateral_usdc)) {
    throw new Error("Put collateral exceeds the on-chain collateral limit.");
  }
  if (BigInt(input.expiryNs) > BigInt(policy.expires_at_ns)) throw new Error("Proposal expiry exceeds the agent policy expiry.");
  const rationaleHash = createHash("sha256").update(JSON.stringify({
    proposalId, kind: input.kind, assetId: input.assetId, principal: input.principal, holder: input.holder,
    quantity: input.quantity, strike: input.strike, premium: input.premium,
    expiryNs: input.expiryNs, rationale: input.rationale, risks: input.risks,
    model: input.model, provider: input.provider,
  })).digest("hex");
  await assertScopedFunctionCallKey(accountId, privateKey, contractId, rpcUrl, ["create_agent_proposal"]);
  const provider = new JsonRpcProvider({ url: rpcUrl });
  const signer = new Account(accountId, provider, privateKey);
  const outcome = await signer.callFunction({
    contractId,
    methodName: "create_agent_proposal",
    args: {
      proposal_id: proposalId,
      kind: input.kind,
      holder: input.holder,
      asset_id: input.assetId,
      underlying_amount: input.quantity,
      strike_amount_usdc: input.strike,
      expiry_ns: input.expiryNs,
      premium_amount_usdc: input.premium,
      rationale_hash: rationaleHash,
    },
    gas: teraToGas("80"),
    deposit: 0n,
  });
  const transactionHash = outcome?.transaction?.hash || outcome?.transaction_outcome?.id || outcome?.transaction_outcome?.transaction_hash;
  const chainProposal = await viewContract(rpcUrl, contractId, "get_agent_proposal", { proposal_id: proposalId });
  if (!chainProposal || chainProposal.state !== "PendingApproval" || chainProposal.agent_id !== accountId ||
      chainProposal.principal !== input.principal || chainProposal.position_id == null) {
    throw new Error("Agent transaction returned but the pending proposal could not be independently verified on-chain.");
  }
  const position = await viewContract(rpcUrl, contractId, "get_position", { id: Number(chainProposal.position_id) });
  if (!position || position.writer !== input.principal || position.holder !== input.holder ||
      position.kind !== input.kind || position.asset_id !== input.assetId ||
      String(position.underlying_amount) !== input.quantity ||
      String(position.strike_amount_usdc) !== input.strike ||
      String(position.premium_amount_usdc) !== input.premium ||
      String(position.expiry_ns) !== input.expiryNs || position.state !== "PendingCollateral") {
    throw new Error("On-chain position does not match the separately authorized writer, holder, and signed trade terms.");
  }
  if (!transactionHash) throw new Error("Proposal exists on-chain, but the RPC response did not include its transaction hash.");
  return { proposalId, positionId: String(chainProposal.position_id), transactionHash, accountId, contractId };
}
function proposalAuthMessage(input) {
  return [
    "Handel agent proposal authorization",
    "Action: " + (input.action || "submit one pending options proposal for principal approval"),
    "Version: 1",
    "Principal: " + input.principal,
    "Holder: " + input.holder,
    "Option type: " + input.kind,
    "Asset ID: " + input.assetId,
    "Underlying amount (base units): " + input.quantity,
    "Strike amount (USDC base units): " + input.strike,
    "Premium amount (USDC base units): " + input.premium,
    "Expiry (nanoseconds): " + input.expiryNs,
    "Issued at (milliseconds): " + input.issuedAtMs,
  ].join("\n");
}
async function verifyProposalAuthorization(input, authorization, rpcUrl) {
  if (!authorization || typeof authorization !== "object") throw new Error("A principal wallet signature is required before the agent can submit a proposal.");
  const recipient = "handel-live.vercel.app";
  if (authorization.recipient !== recipient || typeof authorization.nonce !== "string" ||
      typeof authorization.message !== "string" || typeof authorization.callbackUrl !== "string" || typeof authorization.publicKey !== "string" ||
      typeof authorization.signature !== "string" || !/^[0-9]+$/.test(String(authorization.issuedAtMs))) {
    throw new Error("Invalid proposal authorization payload.");
  }
  let callbackOrigin = "";
  try { callbackOrigin = new URL(authorization.callbackUrl).origin; } catch { throw new Error("Proposal authorization callback URL is invalid."); }
  if (!["https://handel-live.vercel.app", "https://handel-frontend.vercel.app"].includes(callbackOrigin)) {
    throw new Error("Proposal authorization callback URL is not an approved Handel origin.");
  }
  const issuedAtMs = Number(authorization.issuedAtMs);
  if (!Number.isSafeInteger(issuedAtMs) || Math.abs(Date.now() - issuedAtMs) > 5 * 60 * 1000) {
    throw new Error("Proposal authorization expired. Please sign again.");
  }
  const nonce = Buffer.from(authorization.nonce, "base64");
  if (nonce.length !== 32 || nonce.toString("base64") !== authorization.nonce) throw new Error("Proposal authorization nonce is invalid.");
  const expectedMessage = proposalAuthMessage({ ...input, issuedAtMs });
  if (authorization.message !== expectedMessage) throw new Error("Signed proposal terms do not match the submitted trade request.");
  const signature = Buffer.from(authorization.signature, "base64");
  if (signature.length !== 64 || signature.toString("base64") !== authorization.signature) throw new Error("Proposal authorization signature encoding is invalid.");
  const provider = new JsonRpcProvider({ url: rpcUrl });
  await verifyMessage({
    payload: { message: authorization.message, nonce, recipient, callbackUrl: authorization.callbackUrl },
    provider,
    signature,
    signerAccountId: input.principal,
    signerPublicKey: authorization.publicKey,
  });
  return "handel-" + createHash("sha256").update(input.principal + ":" + authorization.nonce).digest("hex").slice(0, 32);
}
async function aiRationale(input) {
  const api = getClient();
  const model = process.env.NEARAI_MODEL || "z-ai/glm-5.3-flash";
  const completion = await api.chat.completions.create({
    model,
    max_tokens: intEnv("HANDEL_AI_MAX_COMPLETION_TOKENS", 512),
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: "You are Handel's options research assistant. Return concise JSON only with exactly two keys: rationale (plain string, max 800 chars) and risks (array of 2 to 5 concise strings). Use only the supplied demo assumptions. Never invent live prices, market feeds, or guaranteed outcomes." },
      { role: "user", content: JSON.stringify(input) },
    ],
  });
  await api.verifyResponse(completion.id);
  const raw = completion.choices?.[0]?.message?.content;
  if (typeof raw !== "string") throw new Error("NEAR AI returned no text");
  const parsed = JSON.parse(raw.replace(/^\s*```json\s*/i, "").replace(/\s*```\s*$/, ""));
  if (typeof parsed.rationale !== "string" || !Array.isArray(parsed.risks) ||
      parsed.risks.length < 2 || parsed.risks.length > 5 ||
      parsed.risks.some((risk) => typeof risk !== "string" || risk.length > 300)) {
    throw new Error("NEAR AI returned invalid rationale data");
  }
  return { rationale: parsed.rationale.slice(0, 800), risks: parsed.risks, provider: "NEAR AI Cloud", model, verified: true };
}
async function proposal(req, res) {
  const input = parseBody(req);
  if (!validAccount(input.principal) || !validAccount(input.holder) || input.principal === input.holder || !input.request || typeof input.request !== "object") {
    return json(res, 400, { error: "invalid_proposal_request" });
  }
  const r = input.request;
  if (r.type !== "Call" && r.type !== "Put") return json(res, 400, { error: "invalid_option_type" });
  const assetId = typeof r.assetId === "string" ? r.assetId : "";
  const allowedAssetId = process.env.HANDEL_DEMO_UNDERLYING_ASSET_ID || "nep141:wnear.tidepool-sandbox.testnet";
  if (assetId !== allowedAssetId) return json(res, 400, { error: "unsupported_demo_underlying", expectedAssetId: allowedAssetId });
  const quantity = positiveString(r.quantity, "quantity");
  const strike = positiveString(r.strike, "strike");
  const expiryNs = positiveString(r.expiryNs, "expiryNs");
  const expiry = BigInt(expiryNs);
  const nowNs = BigInt(Date.now()) * 1_000_000n;
  if (expiry <= nowNs || expiry > nowNs + 120n * 86_400_000_000_000n) {
    return json(res, 400, { error: "expiry_outside_demo_window" });
  }
  const premium = positiveString(process.env.HANDEL_DEMO_PREMIUM_FIXTURE || "5000000", "HANDEL_DEMO_PREMIUM_FIXTURE");
  const agent = agentConfig();
  const proposalId = await verifyProposalAuthorization({ principal: input.principal, holder: input.holder, kind: r.type, assetId, quantity, strike, premium, expiryNs }, input.authorization, agent.rpcUrl);
  await assertAgentPolicy({ principal: input.principal, holder: input.holder, kind: r.type, assetId, quantity, strike, premium, expiryNs }, agent);
  const maxU128 = (1n << 128n) - 1n;
  if ([quantity, strike, premium].some((value) => BigInt(value) > maxU128)) return json(res, 400, { error: "amount_exceeds_u128" });
  const ai = await aiRationale({ objective: String(r.objective || "").slice(0, 1000), type: r.type, assetId, quantity, strike, expiryNs, premium, pricing: "DEMO_FIXTURE" });
  const now = new Date().toISOString();
  const proposal = {
    proposalId: "pending-agent-proposal",
    type: r.type,
    underlyingAssetId: assetId,
    strike, quantity, premium, expiryNs,
    estimatedPayoff: "Illustrative payoff only; premium is a configured demo fixture.",
    risks: ai.risks,
    dataFreshness: now,
    rationale: ai.rationale,
    createdAt: now,
  };
  const submitted = await submitOnChainAgentProposal({
    principal: input.principal, holder: input.holder, kind: r.type, assetId, quantity, strike, premium,
    expiryNs, rationale: ai.rationale, risks: ai.risks, model: ai.model, provider: ai.provider,
    proposalId,
  });
  return json(res, 200, {
    proposal: { ...proposal, proposalId: submitted.proposalId, principal: input.principal, holder: input.holder, positionId: submitted.positionId },
    prepared: {
      method: "approve_agent_proposal",
      args: {
        proposal_id: submitted.proposalId,
        position_id: submitted.positionId,
        kind: r.type,
        asset_id: assetId,
        underlying_amount: quantity,
        strike_amount_usdc: strike,
        expiry_ns: expiryNs,
        premium_amount_usdc: premium,
        agent_tx_hash: submitted.transactionHash,
      },
    },
    agentSubmission: { accountId: submitted.accountId, transactionHash: submitted.transactionHash },
    approvalRequired: true,
    pricingMode: "demo_fixture",
    ai: { provider: ai.provider, model: ai.model, responseVerified: ai.verified },
    executionEligible: false,
    transactionSubmitted: true,
    walletSignatureRequested: false,
    policySource: "NEAR Testnet OptionsContract",
    approvalMode: "agent_submitted_principal_approval",
  });
}

const SESSION_RECIPIENT = "handel-live.vercel.app";
const SESSION_ORIGINS = new Set(["https://handel-live.vercel.app", "https://handel-frontend.vercel.app"]);
function sessionMessage(principal, issuedAtMs) {
  return ["Handel delegated trading session", "Version: 1", "Principal: " + principal,
    "Scope: execute trades only within the principal's active on-chain delegated policy",
    "Issued at (milliseconds): " + issuedAtMs].join("\n");
}
function signSession(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return body + "." + signature;
}
function verifySession(token, principal, secret) {
  if (typeof token !== "string" || token.length > 4096) throw new Error("A valid delegated trading session is required.");
  const parts = token.split(".");
  if (parts.length !== 2) throw new Error("Delegated session token is malformed.");
  const expected = createHmac("sha256", secret).update(parts[0]).digest();
  const supplied = Buffer.from(parts[1], "base64url");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new Error("Delegated session token signature is invalid.");
  let payload;
  try { payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")); } catch { throw new Error("Delegated session token payload is invalid."); }
  const now = Math.floor(Date.now() / 1000);
  if (payload?.aud !== "handel-delegated-trading" || payload?.sub !== principal ||
      !Number.isSafeInteger(payload.exp) || payload.exp <= now ||
      !Number.isSafeInteger(payload.iat) || payload.iat > now + 60) {
    throw new Error("Delegated trading session expired or belongs to another wallet. Reconnect your wallet.");
  }
  return payload;
}
async function createDelegatedSession(req, res) {
  const secret = process.env.HANDEL_AGENT_API_TOKEN;
  if (!secret || secret.length < 32) return json(res, 503, { error: "delegated_session_not_configured" });
  const input = parseBody(req);
  const auth = input.authorization;
  if (!validAccount(input.principal) || !auth || typeof auth !== "object") return json(res, 400, { error: "invalid_session_request" });
  if (auth.recipient !== SESSION_RECIPIENT || typeof auth.callbackUrl !== "string" ||
      typeof auth.message !== "string" || typeof auth.nonce !== "string" ||
      typeof auth.publicKey !== "string" || typeof auth.signature !== "string" ||
      !/^[0-9]+$/.test(String(auth.issuedAtMs))) return json(res, 400, { error: "invalid_session_authorization" });
  let origin = "";
  try { origin = new URL(auth.callbackUrl).origin; } catch { return json(res, 400, { error: "invalid_session_callback" }); }
  if (!SESSION_ORIGINS.has(origin)) return json(res, 403, { error: "unapproved_session_origin" });
  const issuedAtMs = Number(auth.issuedAtMs);
  if (!Number.isSafeInteger(issuedAtMs) || Math.abs(Date.now() - issuedAtMs) > 5 * 60 * 1000) return json(res, 401, { error: "session_signature_expired" });
  const nonce = Buffer.from(auth.nonce, "base64");
  if (nonce.length !== 32 || nonce.toString("base64") !== auth.nonce ||
      auth.message !== sessionMessage(input.principal, String(issuedAtMs))) return json(res, 400, { error: "session_message_mismatch" });
  const signature = Buffer.from(auth.signature, "base64");
  if (signature.length !== 64 || signature.toString("base64") !== auth.signature) return json(res, 400, { error: "invalid_session_signature" });
  await verifyMessage({
    payload: { message: auth.message, nonce, recipient: SESSION_RECIPIENT, callbackUrl: auth.callbackUrl },
    provider: new JsonRpcProvider({ url: process.env.NEAR_RPC_URL || "https://rpc.testnet.fastnear.com" }),
    signature, signerAccountId: input.principal, signerPublicKey: auth.publicKey,
  });
  const now = Math.floor(Date.now() / 1000);
  const token = signSession({ sub: input.principal, aud: "handel-delegated-trading", iat: now, exp: now + 12 * 60 * 60 }, secret);
  return json(res, 200, { token, expiresAt: new Date((now + 12 * 60 * 60) * 1000).toISOString(), principal: input.principal });
}
function decimalToBaseUnits(value, decimals, label) {
  if (typeof value !== "string" || !/^\d+(?:\.\d+)?$/.test(value)) throw new Error(label + " must be a positive decimal amount.");
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > decimals) throw new Error(label + " has too many decimal places.");
  const amount = BigInt(whole) * (10n ** BigInt(decimals)) + BigInt((fraction + "0".repeat(decimals)).slice(0, decimals) || "0");
  if (amount <= 0n || amount > (1n << 128n) - 1n) throw new Error(label + " is outside the supported range.");
  return amount.toString();
}
async function assistantChat(req, res) {
  const input = parseBody(req);
  if (typeof input.message !== "string" || !input.message.trim() || input.message.length > 2000) return json(res, 400, { error: "invalid_message" });
  const api = getClient();
  const model = process.env.NEARAI_MODEL || "z-ai/glm-5.3-flash";
  const completion = await api.chat.completions.create({
    model, max_tokens: 700, response_format: { type: "json_object" },
    messages: [
      { role: "system", content: "You are Handel, a NEAR Testnet options trading assistant. Return JSON only with keys kind, answer, trade. kind is answer, clarification, or trade_intent. Answer market and options questions using only the stated demo/testnet context; never invent live market prices, quotes, balances, news, or fills. Only use trade_intent when the user explicitly instructs you to create/write a new Call or Put option now; questions, hypotheticals, research, and requests to buy an option are not writer-side create orders. Supported underlying is WNEAR on NEAR Testnet. A complete writer order requires a holder NEAR account, option type Call or Put, WNEAR quantity as a decimal string, USDC strike/collateral as a decimal string, and expiryDays integer 1..365. If any are missing, set kind=clarification and ask only for the missing details; do not guess. If complete, set kind=trade_intent, answer to a concise execution summary, and trade to {type,holder,quantityWnear,strikeUsdc,expiryDays}. Do not add fields. Never claim a trade was placed." },
      { role: "user", content: JSON.stringify({ message: input.message, context: input.context || {}, network: "NEAR Testnet", pricingMode: "demo_fixture", supportedAsset: "nep141:wnear.tidepool-sandbox.testnet" }) }
    ]
  });
  await api.verifyResponse(completion.id);
  const raw = completion.choices?.[0]?.message?.content;
  if (typeof raw !== "string") throw new Error("Handel AI returned no response.");
  const parsed = JSON.parse(raw);
  if (!["answer", "clarification", "trade_intent"].includes(parsed.kind) || typeof parsed.answer !== "string") throw new Error("Handel AI returned an invalid response.");
  if (parsed.kind === "trade_intent") {
    const t = parsed.trade;
    if (!t || !validAccount(t.holder) || !["Call", "Put"].includes(t.type) ||
        !Number.isInteger(t.expiryDays) || t.expiryDays < 1 || t.expiryDays > 365) {
      return json(res, 200, { kind: "clarification", answer: "I need the holder NEAR account, option type, WNEAR quantity, USDC strike, and expiry (1–365 days) before I can submit this trade." });
    }
    try {
      decimalToBaseUnits(t.quantityWnear, 24, "WNEAR quantity");
      decimalToBaseUnits(t.strikeUsdc, 6, "USDC strike");
    } catch (error) {
      return json(res, 200, { kind: "clarification", answer: error instanceof Error ? error.message : "Please correct the trade amounts." });
    }
    return json(res, 200, { kind: "trade_intent", answer: parsed.answer, trade: {
      type: t.type, holder: t.holder, quantityWnear: t.quantityWnear, strikeUsdc: t.strikeUsdc, expiryDays: t.expiryDays,
    } });
  }
  return json(res, 200, { kind: parsed.kind, answer: parsed.answer });
}

async function delegatedTrade(req, res) {
  const expectedToken = process.env.HANDEL_AGENT_API_TOKEN;
  if (!expectedToken || !process.env.NEAR_AGENT_ACCOUNT_ID || !process.env.NEAR_AGENT_DELEGATED_FUNCTION_CALL_PRIVATE_KEY) {
    return json(res, 503, { error: "delegated_execution_not_configured", message: "A dedicated restricted Testnet agent key and server-side API token is required. No transaction was submitted." });
  }
  if (req.headers?.authorization !== "Bearer " + expectedToken) return json(res, 401, { error: "unauthorized" });
  const input = parseBody(req);
  if (!validAccount(input.principal) || !validAccount(input.holder) || !input.request || typeof input.request !== "object") {
    return json(res, 400, { error: "invalid_delegated_trade_request" });
  }
  const request = input.request;
  if (request.type !== "Call" && request.type !== "Put") return json(res, 400, { error: "invalid_option_type" });
  const assetId = typeof request.assetId === "string" ? request.assetId : "";
  const quantity = positiveString(request.quantity, "quantity");
  const strike = positiveString(request.strike, "strike");
  const expiryNs = positiveString(request.expiryNs, "expiryNs");
  const maxU128 = (1n << 128n) - 1n;
  if ([quantity, strike].some(value => BigInt(value) > maxU128)) return json(res, 400, { error: "amount_exceeds_u128" });
  verifySession(input.sessionToken, input.principal, expectedToken);
  const premium = process.env.HANDEL_DEMO_PREMIUM_FIXTURE || "5000000";
  const trade = await submitDelegatedTrade({
    principal: input.principal,
    holder: input.holder,
    type: request.type,
    assetId,
    quantity,
    strike,
    expiryNs,
  });
  return json(res, 200, {
    trade,
    transactionSubmitted: true,
    pricingMode: "demo_fixture",
    network: "testnet",
    collateralTransferAuthorized: false,
    premiumPaymentAuthorized: false,
    note: "The agent created the option and registered Escrow. The principal must still sign the collateral transfer; the holder must sign premium payment. No token transfer is performed by the agent.",
  });
}

export async function handleHandelApi(req, res, path) {
  const allowedOrigins = (process.env.HANDEL_ALLOWED_ORIGINS || "https://handel-live.vercel.app,https://handel-frontend.vercel.app")
    .split(",").map((x) => x.trim()).filter(Boolean);
  const origin = req.headers?.origin;
  if (origin && allowedOrigins.includes(origin)) res.setHeader("access-control-allow-origin", origin);
  res.setHeader("vary", "Origin");
  res.setHeader("access-control-allow-methods", "POST, OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type, authorization");
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
  if (req.method !== "POST" && path !== "/health") return json(res, 405, { error: "method_not_allowed" });
  try {
    if (path === "/health") return json(res, 200, { ok: true, service: "handel", network: "testnet", pricingMode: "demo_fixture", delegatedExecutionConfigured: Boolean(process.env.NEAR_AGENT_ACCOUNT_ID && process.env.NEAR_AGENT_DELEGATED_FUNCTION_CALL_PRIVATE_KEY && process.env.HANDEL_AGENT_API_TOKEN) });
    if (path === "/v1/advisory/proposals") return await proposal(req, res);
    if (path === "/v1/session") { if (req.headers?.authorization !== "Bearer " + process.env.HANDEL_AGENT_API_TOKEN) return json(res, 401, { error: "unauthorized" }); return await createDelegatedSession(req, res); }
    if (path === "/v1/assistant/chat") return await assistantChat(req, res);
    if (path === "/v1/delegated/trades") return await delegatedTrade(req, res);
    if (path === "/v1/education/answer") {
      const input = parseBody(req);
      if (typeof input.question !== "string" || !input.question.trim() || input.question.length > 2000) return json(res, 400, { error: "invalid_question" });
      const api = getClient();
      const model = process.env.NEARAI_MODEL || "z-ai/glm-5.3-flash";
      const completion = await api.chat.completions.create({ model, max_tokens: 512,
        messages: [{ role: "system", content: "You are Handel, an options education assistant. Explain concepts clearly. Never present demo data as live market data." },
          { role: "user", content: input.question }] });
      await api.verifyResponse(completion.id);
      return json(res, 200, { answer: completion.choices?.[0]?.message?.content || "", mode: "EDUCATION_ONLY",
        executionEligible: false, transactionSubmitted: false, responseVerified: true });
    }
    return json(res, 404, { error: "not_found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "service unavailable";
    return json(res, 503, { error: "handel_service_unavailable", detail: message.slice(0, 240) });
  }
}
