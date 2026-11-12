import test from "node:test";
import assert from "node:assert/strict";
import {
  createHandelAgentRuntime,
  createHandelAdvisoryAgent,
  createHandelNearAiStack,
  HANDEL_NEARAI_TEE_ALLOWLIST,
} from "./nearai-stack.js";
import type { NearAiClient } from "./nearai-provider.js";
import type { NearAiSystemOneClient } from "./nearai-systemone.js";

const budget = {
  budgetMicros: 1_000_000, maxRequestCostMicros: 10_000,
  maxRequests: 20, maxCompletionTokens: 512, maxPromptBytes: 16_000,
};
const chatClient: NearAiClient = {
  verify: async () => ({ gateway: { tcbStatus: "UpToDate", signer: { signingAddress: "40599fb284f43953bb356b09080fd803c960fc10285ad90eca462ca711ad4acb" } } }),
  chat: { completions: { create: async () => ({ id: "chat-1", choices: [{ message: { content: "{}" } }] }) } },
  verifyResponse: async () => ({ signatureKind: "provider_tee" }),
};
const systemOneClient: NearAiSystemOneClient = {
  verify: async () => ({ gateway: { tcbStatus: "UpToDate", signer: { signingAddress: "40599fb284f43953bb356b09080fd803c960fc10285ad90eca462ca711ad4acb" } }, models: [] }),
  systemone: { create: async () => ({ decisionId: "decision-1", data: { answers: { guard: { type: "choice", choice: "allow", confidence: 0.99 } } } }) },
  verifyResponse: async () => ({ signatureKind: "gateway" }),
};

test("assembles official Chat and System One clients with pinned evidence and one shared budget", async () => {
  let chatConfigSeen: any;
  let systemConfigSeen: any;
  const stack = await createHandelNearAiStack("test-key", budget, {
    createChatClient: async config => { chatConfigSeen = config; return chatClient; },
    createSystemOneClient: async config => { systemConfigSeen = config; return systemOneClient; },
  });
  assert.equal(chatConfigSeen.model, HANDEL_NEARAI_TEE_ALLOWLIST.chat.model);
  assert.equal(chatConfigSeen.requireProviderTee, true);
  assert.equal(chatConfigSeen.attestationCacheTimeToLiveMs, 0);
  assert.equal(systemConfigSeen.model, HANDEL_NEARAI_TEE_ALLOWLIST.systemOne.model);
  assert.equal(systemConfigSeen.signaturePolicy, "gateway");
  stack.budgetLedger.reserve();
  assert.equal(stack.proposalProvider.budgetSnapshot().requestsReserved, 1);
  assert.equal(stack.systemOneGuard.budgetSnapshot().requestsReserved, 1);
  const runtime = createHandelAgentRuntime(stack, {
    pricing: { quote: async () => ({ premium: "1", source: "fixture", calculatedAt: new Date().toISOString(), methodology: "fixture", evidenceHash: "a".repeat(64), verificationMethod: "fixture", evidenceType: "signed_source" }) },
    decisions: { record: async input => ({ ...input, previousHash: "GENESIS", recordHash: "a".repeat(64) }), list: () => [] },
    marketVerifier: { verify: async () => ({ approved: false, executionEligible: false, evidenceType: "display_only", method: "fixture", evidenceHash: "b".repeat(64) }) },
  });
  assert.ok(runtime instanceof Object);
  const advisoryAgent = createHandelAdvisoryAgent(stack);
  assert.ok(advisoryAgent instanceof Object);
  assert.equal(advisoryAgent.constructor.name, "HandelAdvisoryAgent");
});

test("requires an API key and explicit valid budget", async () => {
  await assert.rejects(() => createHandelNearAiStack("", budget, {}), /NEARAI_API_KEY is required/);
  await assert.rejects(() => createHandelNearAiStack("key", { ...budget, maxRequestCostMicros: 2_000_000 }, {
    createChatClient: async () => chatClient,
    createSystemOneClient: async () => systemOneClient,
  }), /request reservation exceeds total budget/);
});
