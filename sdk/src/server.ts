import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import { createHandelNearAiStack, createHandelAdvisoryAgent } from "./nearai-stack.js";
import { HandelEducationAgent } from "./education-agent.js";
import { prepareAdvisoryAgentProposal, type PreparedAdvisoryApproval } from "./advisory-workflow.js";
import type { AdvisoryAgentRequest } from "./advisory-agent.js";
import type { AgentPermission } from "./types.js";
import { isAccountId } from "./proposal-workflow.js";

export interface AdvisoryApiInput {
  agentId: string;
  holder: string;
  request: Omit<AdvisoryAgentRequest, "demoPremiumFixture">;
}
export interface EducationApiInput { question: string; context?: unknown; }
export interface AdvisoryApiDependencies {
  prepare(input: AdvisoryApiInput): Promise<PreparedAdvisoryApproval>;
  answerEducation?(input: EducationApiInput): Promise<Awaited<ReturnType<HandelEducationAgent["answer"]>>>;
}
export interface AdvisoryHttpOptions {
  allowedOrigins?: string[];
  bearerToken?: string;
  requireAuth?: boolean;
  maxBodyBytes?: number;
  maxRequestsPerMinute?: number;
}
export class AdvisoryApiError extends Error {
  constructor(message: string, readonly statusCode: number) { super(message); this.name = "AdvisoryApiError"; }
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}
async function readJson(req: IncomingMessage, maxBytes: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const part of req) {
    const chunk = Buffer.isBuffer(part) ? part : Buffer.from(part);
    size += chunk.byteLength;
    if (size > maxBytes) throw new AdvisoryApiError("request body exceeds size limit", 413);
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new AdvisoryApiError("request body must be valid JSON", 400); }
}
function validateInput(value: unknown): AdvisoryApiInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AdvisoryApiError("request must be an object", 400);
  const x = value as Record<string, unknown>;
  if (!isAccountId(String(x.agentId ?? "")) || !isAccountId(String(x.holder ?? ""))) {
    throw new AdvisoryApiError("agentId and holder must be valid NEAR account IDs", 400);
  }
  if (!x.request || typeof x.request !== "object" || Array.isArray(x.request)) {
    throw new AdvisoryApiError("request terms are required", 400);
  }
  const r = x.request as Record<string, unknown>;
  if (r.type !== "Call" && r.type !== "Put") throw new AdvisoryApiError("type must be Call or Put", 400);
  for (const key of ["assetId", "quantity", "strike", "expiryNs", "objective"] as const) {
    if (typeof r[key] !== "string" || !r[key].trim()) throw new AdvisoryApiError(key + " is required", 400);
  }
  if ((r.assetId as string).length > 256 || (r.quantity as string).length > 78 ||
      (r.strike as string).length > 78 || (r.expiryNs as string).length > 24 ||
      (r.objective as string).length > 2000) throw new AdvisoryApiError("one or more request fields exceed their size limit", 400);
  return {
    agentId: x.agentId as string,
    holder: x.holder as string,
    request: {
      type: r.type,
      assetId: r.assetId as string,
      quantity: r.quantity as string,
      strike: r.strike as string,
      expiryNs: r.expiryNs as string,
      objective: r.objective as string,
    },
  };
}

function validateEducationInput(value: unknown): EducationApiInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AdvisoryApiError("request must be an object", 400);
  const x = value as Record<string, unknown>;
  if (typeof x.question !== "string" || !x.question.trim() || x.question.length > 2_000) {
    throw new AdvisoryApiError("question must contain 1–2000 characters", 400);
  }
  let bytes: number;
  try { bytes = new TextEncoder().encode(JSON.stringify(x.context ?? null)).byteLength; }
  catch { throw new AdvisoryApiError("context must be JSON-serializable", 400); }
  if (bytes > 8_000) throw new AdvisoryApiError("context exceeds size limit", 400);
  return { question: x.question.trim(), context: x.context ?? null };
}

/** Localhost API for educational answers and advisory proposals. It never signs or submits transactions. */
export function createHandelAdvisoryHttpServer(
  dependencies: AdvisoryApiDependencies,
  options: AdvisoryHttpOptions = {},
): Server {
  const allowedOrigins = new Set(options.allowedOrigins ?? [
    "http://localhost:3000", "http://127.0.0.1:3000",
    "http://localhost:5173", "http://127.0.0.1:5173",
  ]);
  const maxBodyBytes = options.maxBodyBytes ?? 32_768;
  const maxRequests = options.maxRequestsPerMinute ?? 10;
  const hits = new Map<string, number[]>();

  return createServer((req, res) => {
    void (async () => {
      const origin = req.headers.origin;
      if (origin) {
        if (!allowedOrigins.has(origin)) throw new AdvisoryApiError("origin is not allowed", 403);
        res.setHeader("access-control-allow-origin", origin);
        res.setHeader("vary", "Origin");
        res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
        res.setHeader("access-control-allow-headers", "content-type, authorization");
      }
      if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
      if (req.method === "GET" && req.url === "/health") {
        send(res, 200, { ok: true, service: "handel-advisory-api", mode: "education-and-advisory", transactionSubmission: false });
        return;
      }
      if (req.method !== "POST" || (req.url !== "/v1/advisory/proposals" && req.url !== "/v1/education/answer")) {
        send(res, 404, { error: "not_found" }); return;
      }
      if (options.requireAuth) {
        const expected = options.bearerToken;
        const supplied = req.headers.authorization;
        if (!expected || supplied !== "Bearer " + expected) throw new AdvisoryApiError("unauthorized", 401);
      }
      const ip = req.socket.remoteAddress ?? "unknown";
      const now = Date.now();
      const recent = (hits.get(ip) ?? []).filter(t => t > now - 60_000);
      if (recent.length >= maxRequests) throw new AdvisoryApiError("rate limit exceeded", 429);
      recent.push(now); hits.set(ip, recent);

      const body = await readJson(req, maxBodyBytes);
      if (req.url === "/v1/education/answer") {
        if (!dependencies.answerEducation) throw new AdvisoryApiError("education service is unavailable", 503);
        const result = await dependencies.answerEducation(validateEducationInput(body));
        send(res, 200, {
          ...result,
          transactionSubmitted: false,
          walletSignatureRequested: false,
        });
        return;
      }
      const result = await dependencies.prepare(validateInput(body));
      send(res, 200, {
        ...result,
        transactionSubmitted: false,
        walletSignatureRequested: false,
        note: "Advisory only. The configured agent wallet must submit the pending proposal; the principal must separately approve it on-chain.",
      });
    })().catch(error => {
      if (res.headersSent) { res.destroy(); return; }
      if (error instanceof AdvisoryApiError) send(res, error.statusCode, { error: error.message });
      else send(res, 503, { error: "advisory_service_unavailable" });
    });
  });
}

type RpcFetcher = (input: string | URL, init?: RequestInit) => Promise<Response>;
interface RpcResponse { result?: { result?: number[]; block_height?: number; block_hash?: string }; error?: { message?: string }; }
async function viewCall<T>(rpcUrl: string, contractId: string, methodName: string, args: unknown, fetcher: RpcFetcher): Promise<{ value: T; blockHeight: number }> {
  const response = await fetcher(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: "handel-policy-read", method: "query",
      params: {
        request_type: "call_function", finality: "final", account_id: contractId,
        method_name: methodName, args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
      },
    }),
  });
  if (!response.ok) throw new AdvisoryApiError("NEAR RPC policy read failed", 503);
  const body = await response.json() as RpcResponse;
  if (body.error || !Array.isArray(body.result?.result)) throw new AdvisoryApiError("NEAR RPC policy read returned no final result", 503);
  let value: T;
  try { value = JSON.parse(Buffer.from(body.result.result).toString("utf8")) as T; }
  catch { throw new AdvisoryApiError("NEAR RPC policy response is malformed", 503); }
  return { value, blockHeight: body.result.block_height ?? 0 };
}

export async function readOnChainAgentPermission(input: {
  rpcUrl: string;
  contractId: string;
  agentId: string;
  fetcher?: RpcFetcher;
}): Promise<{ permission: AgentPermission; blockHeight: number }> {
  if (!isAccountId(input.contractId) || !isAccountId(input.agentId)) throw new AdvisoryApiError("contractId or agentId is invalid", 400);
  const url = new URL(input.rpcUrl);
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new AdvisoryApiError("NEAR RPC endpoint must use HTTPS", 400);
  }
  const fetcher = input.fetcher ?? fetch;
  const [policyResult, modeResult] = await Promise.all([
    viewCall<Record<string, unknown>>(input.rpcUrl, input.contractId, "get_agent_policy", { agent_id: input.agentId }, fetcher),
    viewCall<string>(input.rpcUrl, input.contractId, "get_agent_execution_mode", { agent_id: input.agentId }, fetcher),
  ]);
  const p = policyResult.value;
  if (!p || typeof p !== "object" || p.enabled !== true || p.principal === undefined ||
      !Array.isArray(p.allowed_assets) || typeof p.max_underlying_amount !== "string" ||
      typeof p.max_premium_usdc !== "string" || typeof p.max_collateral_usdc !== "string" ||
      typeof p.max_open_positions !== "number" || typeof p.expires_at_ns !== "string") {
    throw new AdvisoryApiError("agent policy is missing, disabled, or malformed on-chain", 403);
  }
  if (modeResult.value !== "ManualApproval") throw new AdvisoryApiError("agent must be in ManualApproval mode for advisory proposals", 403);
  if (!isAccountId(String(p.principal))) throw new AdvisoryApiError("on-chain principal account is invalid", 503);
  const permission: AgentPermission = {
    agent: input.agentId,
    owner: p.principal as string,
    allowedAssets: p.allowed_assets as string[],
    maxQuantity: p.max_underlying_amount,
    maxPremium: p.max_premium_usdc,
    maxCollateralUsdc: p.max_collateral_usdc,
    maxOpenPositions: p.max_open_positions,
    minExpiryNs: "0",
    maxExpiryNs: p.expires_at_ns,
    enabled: true,
  };
  if (policyResult.blockHeight !== modeResult.blockHeight) {
    throw new AdvisoryApiError("policy and execution mode were read at different final blocks; retry", 503);
  }
  return { permission, blockHeight: policyResult.blockHeight };
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value?.trim()) throw new Error(name + " is required");
  return value.trim();
}
function positiveIntEnv(name: string): number {
  const raw = requiredEnv(name);
  if (!/^[1-9][0-9]*$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw new Error(name + " must be a positive safe integer");
  return Number(raw);
}

/** Starts the local demo service; all secrets stay in this Node process. */
export async function startHandelAdvisoryServer(): Promise<Server> {
  const host = process.env.HANDEL_HOST ?? "127.0.0.1";
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error("The bundled advisory server is localhost-only; deploy a separately authenticated gateway for remote access");
  }
  const budget = {
    budgetMicros: positiveIntEnv("HANDEL_AI_BUDGET_MICROS"),
    maxRequestCostMicros: positiveIntEnv("HANDEL_AI_MAX_REQUEST_COST_MICROS"),
    maxRequests: positiveIntEnv("HANDEL_AI_MAX_REQUESTS"),
    maxCompletionTokens: positiveIntEnv("HANDEL_AI_MAX_COMPLETION_TOKENS"),
    maxPromptBytes: positiveIntEnv("HANDEL_AI_MAX_PROMPT_BYTES"),
  };
  const apiKey = requiredEnv("NEARAI_API_KEY");
  const rpcUrl = process.env.NEAR_RPC_URL ?? "https://rpc.testnet.fastnear.com";
  const contractId = requiredEnv("HANDEL_OPTIONS_CONTRACT_ID");
  const demoPremiumFixture = process.env.HANDEL_DEMO_PREMIUM_FIXTURE ?? "100000";
  if (!/^(0|[1-9][0-9]*)$/.test(demoPremiumFixture) || BigInt(demoPremiumFixture) <= 0n) {
    throw new Error("HANDEL_DEMO_PREMIUM_FIXTURE must be a positive canonical integer string");
  }
  const stack = await createHandelNearAiStack(apiKey, budget);
  const agent = createHandelAdvisoryAgent(stack);
  const educationAgent = new HandelEducationAgent(stack.proposalProvider, stack.systemOneGuard);
  const allowedOrigins = process.env.HANDEL_ALLOWED_ORIGINS
    ?.split(",").map(origin => origin.trim()).filter(Boolean);
  const server = createHandelAdvisoryHttpServer({
    answerEducation: input => educationAgent.answer(input),
    prepare: async input => {
      const { permission, blockHeight } = await readOnChainAgentPermission({
        rpcUrl, contractId, agentId: input.agentId,
      });
      const prepared = await prepareAdvisoryAgentProposal({
        agent,
        request: { ...input.request, demoPremiumFixture },
        permission,
        holder: input.holder,
      });
      return { ...prepared, policyBlockHeight: blockHeight } as PreparedAdvisoryApproval;
    },
  }, { allowedOrigins });
  const port = process.env.HANDEL_PORT ? positiveIntEnv("HANDEL_PORT") : 8787;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve());
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startHandelAdvisoryServer().then(() => {
    const host = process.env.HANDEL_HOST ?? "127.0.0.1";
    const port = process.env.HANDEL_PORT;
    process.stdout.write("Handel advisory API listening on http://" + host + ":" + port + "\n");
  }).catch(error => {
    process.stderr.write((error instanceof Error ? error.message : "startup failed") + "\n");
    process.exitCode = 1;
  });
}
