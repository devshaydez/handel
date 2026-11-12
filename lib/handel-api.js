import { createHandelNearAiStack, createHandelAdvisoryAgent } from "../sdk/dist/nearai-stack.js";
import { HandelEducationAgent } from "../sdk/dist/education-agent.js";
import { createHandelAdvisoryHttpServer, readOnChainAgentPermission } from "../sdk/dist/server.js";
import { prepareAdvisoryAgentProposal } from "../sdk/dist/advisory-workflow.js";

let serverPromise;

function positiveIntEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  if (!/^[1-9][0-9]*$/.test(raw) || !Number.isSafeInteger(Number(raw))) {
    throw new Error(name + " must be a positive safe integer");
  }
  return Number(raw);
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value?.trim()) throw new Error(name + " is not configured");
  return value.trim();
}

function positiveBaseUnitEnv(name) {
  const value = requiredEnv(name);
  if (!/^[1-9][0-9]*$/.test(value)) throw new Error(name + " must be a positive canonical base-unit integer");
  return value;
}

async function createApi() {
  const apiKey = requiredEnv("NEARAI_API_KEY");
  const budget = {
    budgetMicros: positiveIntEnv("HANDEL_AI_BUDGET_MICROS", 250_000),
    maxRequestCostMicros: positiveIntEnv("HANDEL_AI_MAX_REQUEST_COST_MICROS", 25_000),
    maxRequests: positiveIntEnv("HANDEL_AI_MAX_REQUESTS", 10),
    maxCompletionTokens: positiveIntEnv("HANDEL_AI_MAX_COMPLETION_TOKENS", 512),
    maxPromptBytes: positiveIntEnv("HANDEL_AI_MAX_PROMPT_BYTES", 8_000),
  };
  const stack = await createHandelNearAiStack(apiKey, budget);
  const educationAgent = new HandelEducationAgent(stack.proposalProvider, stack.systemOneGuard);
  const advisoryAgent = createHandelAdvisoryAgent(stack);
  const rpcUrl = process.env.NEAR_RPC_URL ?? "https://rpc.testnet.near.org";
  const optionsContractId = requiredEnv("HANDEL_OPTIONS_CONTRACT_ID");
  // This endpoint is explicitly advisory-only until a verified market/pricing
  // adapter is configured. Never describe this fixture as a live quote.
  const demoPremiumFixture = positiveBaseUnitEnv("HANDEL_DEMO_PREMIUM_FIXTURE");
  const allowedOrigins = (process.env.HANDEL_ALLOWED_ORIGINS ??
    "https://handel-live.vercel.app,https://handel-frontend.vercel.app,https://handel-frontend-shaydyting-2601s-projects.vercel.app,https://handel-frontend-git-feat-front-24f6e3-shaydyting-2601s-projects.vercel.app")
    .split(",").map(value => value.trim()).filter(Boolean);
  return createHandelAdvisoryHttpServer({
    answerEducation: input => educationAgent.answer(input),
    prepare: async input => {
      const { permission, blockHeight } = await readOnChainAgentPermission({
        rpcUrl,
        contractId: optionsContractId,
        agentId: input.agentId,
      });
      const prepared = await prepareAdvisoryAgentProposal({
        agent: advisoryAgent,
        request: { ...input.request, demoPremiumFixture },
        permission,
        holder: input.holder,
      });
      return {
        ...prepared,
        policyBlockHeight: blockHeight,
        pricingMode: "demo_fixture",
        executionEligible: false,
        transactionSubmitted: false,
        walletSignatureRequested: false,
        limitations: [
          ...prepared.advisory.limitations,
          "Premium is a configured test fixture, not live market pricing.",
          "No transaction was submitted; principal approval and wallet signing are separate steps.",
        ],
      };
    },
  }, { allowedOrigins, maxBodyBytes: 12_000, maxRequestsPerMinute: 10 });
}

function getApi() {
  if (!serverPromise) {
    serverPromise = createApi().catch(error => {
      serverPromise = undefined;
      throw error;
    });
  }
  return serverPromise;
}

export async function handleHandelApi(req, res, path) {
  try {
    const api = await getApi();
    const originalUrl = req.url ?? path;
    const queryIndex = originalUrl.indexOf("?");
    const query = queryIndex < 0 ? "" : originalUrl.slice(queryIndex);
    const finished = new Promise(resolve => {
      if (res.writableEnded) return resolve();
      res.once("finish", resolve);
      res.once("close", resolve);
    });
    req.url = path + query;
    api.emit("request", req, res);
    await finished;
  } catch {
    if (!res.headersSent) {
      res.statusCode = 503;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.setHeader("cache-control", "no-store");
      res.end(JSON.stringify({ error: "handel_service_unavailable" }));
    } else if (!res.writableEnded) res.end();
  }
}
