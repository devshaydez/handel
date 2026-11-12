import { InferenceClient } from "@nearai/inference-sdk/node";

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
  if (body.error || !body.result?.result) throw new Error("Unable to read on-chain agent policy");
  return JSON.parse(Buffer.from(body.result.result).toString("utf8"));
}
async function aiRationale(input) {
  const api = getClient();
  const model = process.env.NEARAI_MODEL || "z-ai/glm-5.3-flash";
  const completion = await api.chat.completions.create({
    model,
    max_tokens: intEnv("HANDEL_AI_MAX_COMPLETION_TOKENS", 512),
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
  if (!assetId || assetId.length > 256) return json(res, 400, { error: "invalid_asset_id" });
  const quantity = positiveString(r.quantity, "quantity");
  const strike = positiveString(r.strike, "strike");
  const expiryNs = positiveString(r.expiryNs, "expiryNs");
  const premium = positiveString(required("HANDEL_DEMO_PREMIUM_FIXTURE"), "HANDEL_DEMO_PREMIUM_FIXTURE");
  const now = new Date().toISOString();
  const proposal = {
    proposalId: "handel-" + crypto.randomUUID(),
    type: r.type,
    underlyingAssetId: assetId,
    strike, quantity, premium, expiryNs,
    estimatedPayoff: "Illustrative payoff only; premium is a configured demo fixture.",
    risks: ai.risks,
    dataFreshness: now,
    rationale: ai.rationale,
    createdAt: now,
  };
  // The principal signs the direct OptionsContract offer call. This avoids
  // requiring a server-held agent key while retaining on-chain asset/amount checks.
  const prepared = {
    method: r.type === "Call" ? "create_call" : "create_put",
    args: {
      holder: input.holder,
      asset_id: assetId,
      underlying_amount: quantity,
      strike_amount_usdc: strike,
      expiry_ns: expiryNs,
      premium_amount_usdc: premium,
    },
  };
  return json(res, 200, {
    proposal,
    prepared,
    approvalRequired: true,
    pricingMode: "demo_fixture",
    ai: { provider: ai.provider, model: ai.model, responseVerified: ai.verified },
    executionEligible: true,
    transactionSubmitted: false,
    walletSignatureRequested: false,
    policySource: "NEAR Testnet OptionsContract",
    approvalMode: "principal_wallet_signed_offer",
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
