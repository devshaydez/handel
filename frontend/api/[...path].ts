import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createHandelNearAiStack } from "../../sdk/src/nearai-stack.js";
import { HandelEducationAgent } from "../../sdk/src/education-agent.js";
import { createHandelAdvisoryHttpServer } from "../../sdk/src/server.js";

export const config = { api: { bodyParser: false } };

let serverPromise: Promise<Server> | undefined;

function positiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  if (!/^[1-9][0-9]*$/.test(raw) || !Number.isSafeInteger(Number(raw))) {
    throw new Error(name + " must be a positive safe integer");
  }
  return Number(raw);
}

async function createApi(): Promise<Server> {
  const apiKey = process.env.NEARAI_API_KEY;
  if (!apiKey?.trim()) throw new Error("NEARAI_API_KEY is not configured");

  // Conservative per-instance ceilings for this education-only demo.
  // These are not a shared/global spend cap; use a durable budget service before scaling.
  const budget = {
    budgetMicros: positiveIntEnv("HANDEL_AI_BUDGET_MICROS", 250_000),
    maxRequestCostMicros: positiveIntEnv("HANDEL_AI_MAX_REQUEST_COST_MICROS", 25_000),
    maxRequests: positiveIntEnv("HANDEL_AI_MAX_REQUESTS", 10),
    maxCompletionTokens: positiveIntEnv("HANDEL_AI_MAX_COMPLETION_TOKENS", 512),
    maxPromptBytes: positiveIntEnv("HANDEL_AI_MAX_PROMPT_BYTES", 8_000),
  };
  const stack = await createHandelNearAiStack(apiKey, budget);
  const educationAgent = new HandelEducationAgent(stack.proposalProvider, stack.systemOneGuard);
  const allowedOrigins = (process.env.HANDEL_ALLOWED_ORIGINS ??
    "https://handel-frontend.vercel.app,https://handel-frontend-shaydyting-2601s-projects.vercel.app")
    .split(",").map(value => value.trim()).filter(Boolean);

  return createHandelAdvisoryHttpServer({
    answerEducation: input => educationAgent.answer(input),
    // The public Vercel surface intentionally exposes no proposal preparation route.
    prepare: async () => { throw new Error("advisory proposals are not enabled on the public frontend gateway"); },
  }, {
    allowedOrigins,
    maxBodyBytes: 12_000,
    maxRequestsPerMinute: 10,
  });
}

function getApi(): Promise<Server> {
  if (!serverPromise) {
    serverPromise = createApi().catch(error => {
      serverPromise = undefined;
      throw error;
    });
  }
  return serverPromise;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const originalUrl = req.url ?? "/";
  const path = originalUrl.split("?", 1)[0].replace(/^\\/api(?=\\/|$)/, "") || "/";
  if (path !== "/health" && path !== "/v1/education/answer") {
    json(res, 404, { error: "not_found" });
    return;
  }

  try {
    const api = await getApi();
    const finished = new Promise<void>(resolve => {
      if (res.writableEnded) return resolve();
      res.once("finish", resolve);
      res.once("close", resolve);
    });
    req.url = originalUrl.replace(/^\\/api(?=\\/|$)/, "") || "/";
    api.emit("request", req, res);
    await finished;
  } catch {
    if (!res.headersSent) json(res, 503, { error: "education_service_unavailable" });
    else if (!res.writableEnded) res.end();
  }
}
