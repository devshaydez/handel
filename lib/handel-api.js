import { InferenceClient } from "@nearai/inference-sdk/node";
import { createHash } from "node:crypto";
import { Account, JsonRpcProvider, teraToGas } from "near-api-js";
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
function agentConfig() {
  const accountId = required("NEAR_AGENT_ACCOUNT_ID");
  const privateKey = required("NEAR_AGENT_PRIVATE_KEY");
  if (!accountId.endsWith(".testnet") || !privateKey.startsWith("ed25519:")) {
    throw new Error("NEAR agent must use a Testnet account and an ed25519 key");
  }
  const contractId = process.env.VITE_HANDEL_OPTIONS_CONTRACT_ID || process.env.HANDEL_OPTIONS_CONTRACT_ID || "options.shaydez.testnet";
  const rpcUrl = process.env.NEAR_RPC_URL || "https://rpc.testnet.near.org";
  return { accountId, privateKey, contractId, rpcUrl };
}
async function submitOnChainAgentProposal(input) {
  const { accountId, privateKey, contractId, rpcUrl } = agentConfig();
  const proposalId = input.proposalId;
  const policy = await viewContract(rpcUrl, contractId, "get_agent_policy", { agent_id: accountId });
  if (!policy) throw new Error("Agent policy is not registered on OptionsContract. Register the agent from the principal account first.");
  if (policy.principal !== input.holder) throw new Error("Connected wallet must be the principal account registered for this agent.");
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
    proposalId, kind: input.kind, assetId: input.assetId, holder: input.holder,
    quantity: input.quantity, strike: input.strike, premium: input.premium,
    expiryNs: input.expiryNs, rationale: input.rationale, risks: input.risks,
    model: input.model, provider: input.provider,
  })).digest("hex");
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
    deposit: "0",
  });
  const transactionHash = outcome?.transaction?.hash || outcome?.transaction_outcome?.id || outcome?.transaction_outcome?.transaction_hash;
  const chainProposal = await viewContract(rpcUrl, contractId, "get_agent_proposal", { proposal_id: proposalId });
  if (!chainProposal || chainProposal.state !== "PendingApproval" || chainProposal.agent_id !== accountId ||
      chainProposal.principal !== input.holder) {
    throw new Error("Agent transaction returned but the pending proposal could not be independently verified on-chain.");
  }
  if (!transactionHash) throw new Error("Proposal exists on-chain, but the RPC response did not include its transaction hash.");
  return { proposalId, positionId: String(chainProposal.position_id), transactionHash, accountId, contractId };
}
function proposalAuthMessage(input) {
  return [
    "Handel agent proposal authorization",
    "Action: submit one pending options proposal for principal approval",
    "Version: 1",
    "Principal: " + input.holder,
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
    signerAccountId: input.holder,
    signerPublicKey: authorization.publicKey,
  });
  return "handel-" + createHash("sha256").update(input.holder + ":" + authorization.nonce).digest("hex").slice(0, 32);
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
  if (!validAccount(input.holder) || !input.request || typeof input.request !== "object") {
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
  const proposalId = await verifyProposalAuthorization({ holder: input.holder, kind: r.type, assetId, quantity, strike, premium, expiryNs }, input.authorization, agent.rpcUrl);
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
    holder: input.holder, kind: r.type, assetId, quantity, strike, premium,
    expiryNs, rationale: ai.rationale, risks: ai.risks, model: ai.model, provider: ai.provider,
    proposalId,
  });
  return json(res, 200, {
    proposal: { ...proposal, proposalId: submitted.proposalId },
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
    if (path === "/health") return json(res, 200, { ok: true, service: "handel", network: "testnet", pricingMode: "demo_fixture" });
    if (path === "/v1/advisory/proposals") return await proposal(req, res);
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
