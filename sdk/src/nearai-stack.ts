import {
  createOfficialNearAiClient,
  NearAiBudgetLedger,
  NearAiProposalProvider,
  type NearAiBudget,
  type NearAiClient,
  type NearAiConfig,
} from "./nearai-provider.js";
import {
  createOfficialNearAiSystemOneClient,
  NearAiSystemOneGuard,
  type NearAiSystemOneClient,
  type NearAiSystemOneConfig,
} from "./nearai-systemone.js";
import { HandelAgentRuntime, type MarketEvidenceVerifier, type PremiumEngine } from "./agent-runtime.js";
import { HandelAdvisoryAgent } from "./advisory-agent.js";
import type { DecisionRecorder } from "./decision-journal.js";

/**
 * Initial TEE pin captured from live NEAR AI SDK verification in workflow
 * 42790111229 on 2026-11-10. The exact compose measurement is intentionally
 * pinned: provider redeployments fail closed until this reviewed config changes.
 */
export const HANDEL_NEARAI_TEE_ALLOWLIST = Object.freeze({
  observedAt: "2026-11-11T19:37:15.885Z",
  workflowRunId: 43088851773,
  chat: {
    model: "deepseek-ai/DeepSeek-V4.1-Flash-1017",
    gatewaySigners: ["40599fb284f43953bb356b09080fd803c960fc10285ad90eca462ca711ad4acb"],
    modelSigners: ["236f5a6b91dd47dc3b7b36e43d4eb531a042ffb8f8fbf3a1555b78cef4fdda4c"],
    composeHashes: ["c53e254e8b70aa14b45ba3043730a0736ca2afb1df7fa3db9c61578845e470fe"],
    osImageHashes: ["91fd5d69ccee3e5ea4f2aeb8c9b632c4358c4ecfc29ba1aa6fb1e402af209829"],
  },
  systemOne: {
    model: "levanto/sage-2",
    gatewaySigners: ["40599fb284f43953bb356b09080fd803c960fc10285ad90eca462ca711ad4acb"],
    signaturePolicy: "gateway" as const,
    modelTeeAttested: false,
  },
});

export interface HandelNearAiFactories {
  createChatClient?: (config: NearAiConfig) => Promise<NearAiClient>;
  createSystemOneClient?: (config: NearAiSystemOneConfig) => Promise<NearAiSystemOneClient>;
}

export interface HandelNearAiStack {
  proposalProvider: NearAiProposalProvider;
  systemOneGuard: NearAiSystemOneGuard;
  budgetLedger: NearAiBudgetLedger;
  chatConfig: NearAiConfig;
  systemOneConfig: NearAiSystemOneConfig;
}

/** Builds both official clients and shares one hard-budget ledger across them. */
export async function createHandelNearAiStack(
  apiKey: string,
  budget: NearAiBudget,
  factories: HandelNearAiFactories = {},
): Promise<HandelNearAiStack> {
  if (typeof apiKey !== "string" || !apiKey.trim()) throw new Error("NEARAI_API_KEY is required");
  const chatConfig: NearAiConfig = {
    apiKey,
    model: HANDEL_NEARAI_TEE_ALLOWLIST.chat.model,
    budget,
    allowedGatewaySigners: [...HANDEL_NEARAI_TEE_ALLOWLIST.chat.gatewaySigners],
    allowedModelSigners: [...HANDEL_NEARAI_TEE_ALLOWLIST.chat.modelSigners],
    allowedComposeHashes: [...HANDEL_NEARAI_TEE_ALLOWLIST.chat.composeHashes],
    allowedOsImageHashes: [...HANDEL_NEARAI_TEE_ALLOWLIST.chat.osImageHashes],
    attestationCacheTimeToLiveMs: 0,
    requireProviderTee: true,
  };
  const systemOneConfig: NearAiSystemOneConfig = {
    apiKey,
    model: HANDEL_NEARAI_TEE_ALLOWLIST.systemOne.model,
    allowedGatewaySigners: [...HANDEL_NEARAI_TEE_ALLOWLIST.systemOne.gatewaySigners],
    signaturePolicy: HANDEL_NEARAI_TEE_ALLOWLIST.systemOne.signaturePolicy,
  };
  const budgetLedger = new NearAiBudgetLedger(budget);
  const chatClient = await (factories.createChatClient ?? createOfficialNearAiClient)(chatConfig);
  const systemOneClient = await (factories.createSystemOneClient ?? createOfficialNearAiSystemOneClient)(systemOneConfig);
  return {
    proposalProvider: new NearAiProposalProvider(chatConfig, chatClient, budgetLedger),
    systemOneGuard: new NearAiSystemOneGuard(systemOneConfig, systemOneClient, budgetLedger),
    budgetLedger,
    chatConfig,
    systemOneConfig,
  };
}

/** Wires the verified NEAR AI stack into the host-controlled Handel proposal runtime. */
export function createHandelAgentRuntime(
  stack: HandelNearAiStack,
  dependencies: {
    pricing: PremiumEngine;
    decisions: DecisionRecorder;
    marketVerifier: MarketEvidenceVerifier;
  },
): HandelAgentRuntime {
  return new HandelAgentRuntime(
    stack.proposalProvider,
    dependencies.pricing,
    stack.systemOneGuard,
    dependencies.decisions,
    dependencies.marketVerifier,
  );
}

/** Builds the approval-only live advisory path from the same attested Chat/System One stack. */
export function createHandelAdvisoryAgent(stack: HandelNearAiStack): HandelAdvisoryAgent {
  return new HandelAdvisoryAgent(stack.proposalProvider, stack.systemOneGuard);
}
