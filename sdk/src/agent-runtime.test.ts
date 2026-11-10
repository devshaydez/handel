import test from "node:test";
import assert from "node:assert/strict";
import { HandelAgentRuntime } from "./agent-runtime.js";
import { DecisionJournal, type DecisionRecord, type DecisionSnapshotStore } from "./decision-journal.js";
import { stubProposal } from "./proposal.js";
import { NVDAON_ASSET_ID } from "./assets.js";
import type { AgentPermission } from "./types.js";

class MemoryStore implements DecisionSnapshotStore {
  value: DecisionRecord[] | null = null;
  async load() { return this.value; }
  async save(records: DecisionRecord[]) { this.value = structuredClone(records); }
}
const now = Date.now();
const market = { assetId: NVDAON_ASSET_ID, spotPrice: "1200000", quoteCurrency: "USDC" as const, observedAt: new Date(now).toISOString(), source: "fixture" };
const permission: AgentPermission = {
  agent: "agent.near", owner: "owner.near", allowedAssets: [NVDAON_ASSET_ID],
  maxQuantity: "2000000000000000000", maxPremium: "10000000", maxOpenPositions: 2,
  minExpiryNs: "1", maxExpiryNs: "999999999999999999999999999999", enabled: true,
};
const request = {
  type: "Call" as const, assetId: NVDAON_ASSET_ID, quantity: "1000000000000000000",
  strike: "100000000", expiryNs: (BigInt(now + 86400000) * 1000000n).toString(), objective: "covered call",
};
async function make(premium = "5000000", guard: () => Promise<{ allowed: boolean; outcome: "allow" | "block" | "review"; confidence: number; decisionId: string; signatureKind: "provider_tee" | "gateway" }> = async () => ({
  allowed: true, outcome: "allow" as const, confidence: 0.99, decisionId: "guard-1", signatureKind: "provider_tee" as const,
})) {
  const proposal = stubProposal({ underlyingAssetId: NVDAON_ASSET_ID, quantity: request.quantity, strike: request.strike, daysToExpiry: 1 });
  proposal.expiryNs = request.expiryNs;
  const journal = await DecisionJournal.open(new MemoryStore());
  return {
    runtime: new HandelAgentRuntime(
      { propose: async () => ({ proposal, requestId: "r", verification: { modelId: "test-model" } }) },
      { quote: () => ({ premium, source: "fixture-engine", calculatedAt: new Date().toISOString(), methodology: "fixture" }) },
      { evaluate: guard },
      journal,
      { verify: async () => ({ approved: true, method: "fixture-signature-check", evidenceHash: "market-proof" }) },
    ),
    journal,
  };
}
test("host replaces model premium and durably records a market-verified, guardrail-approved decision", async () => {
  const { runtime, journal } = await make();
  const result = await runtime.propose(request, permission, market);
  assert.equal(result.proposal.premium, "5000000");
  assert.equal(result.policy.ok, true);
  assert.equal(result.guardrail.decisionId, "guard-1");
  assert.equal(result.marketVerification.evidenceHash, "market-proof");
  assert.equal(journal.list().length, 1);
  assert.equal(journal.list()[0].executionState, "proposed");
});
test("records an explicitly Gateway-signed System One screen without upgrading it to model TEE", async () => {
  const { runtime, journal } = await make("5000000", async () => ({
    allowed: true, outcome: "allow", confidence: 0.99, decisionId: "gateway-guard", signatureKind: "gateway",
  }));
  const result = await runtime.propose(request, permission, market);
  assert.equal(result.guardrail.signatureKind, "gateway");
  assert.equal(journal.list()[0]?.guardrailEvidence.signatureKind, "gateway");
});
test("blocks revoked and disallowed agents", async () => {
  const { runtime } = await make();
  await assert.rejects(() => runtime.propose(request, { ...permission, enabled: false }, market));
  await assert.rejects(() => runtime.propose(request, { ...permission, allowedAssets: [] }, market));
});
test("blocks stale data and invalid quote", async () => {
  const { runtime } = await make();
  const { runtime: invalid } = await make("0");
  await assert.rejects(() => runtime.propose(request, permission, { ...market, observedAt: new Date(now - 400000).toISOString() }));
  await assert.rejects(() => invalid.propose(request, permission, market));
});
test("fails closed when market evidence is unapproved or its verifier is unavailable", async () => {
  const { runtime } = await make();
  const proposal = stubProposal({ underlyingAssetId: NVDAON_ASSET_ID, quantity: request.quantity, strike: request.strike, daysToExpiry: 1 });
  proposal.expiryNs = request.expiryNs;
  const journal = await DecisionJournal.open(new MemoryStore());
  const base = { propose: async () => ({ proposal, requestId: "r" }) };
  const pricing = { quote: () => ({ premium: "5000000", source: "fixture-engine", calculatedAt: new Date().toISOString(), methodology: "fixture" }) };
  const guardrail = { evaluate: async () => ({ allowed: true, outcome: "allow" as const, confidence: 0.99, decisionId: "g", signatureKind: "provider_tee" as const }) };
  const denied = new HandelAgentRuntime(base, pricing, guardrail, journal, { verify: async () => ({ approved: false, method: "display-only", evidenceHash: "x" }) });
  await assert.rejects(() => denied.propose(request, permission, market), e => e instanceof Error && "code" in e && e.code === "MARKET_SOURCE_UNVERIFIED");
  const unavailable = new HandelAgentRuntime(base, pricing, guardrail, journal, { verify: async () => { throw new Error("offline"); } });
  await assert.rejects(() => unavailable.propose(request, permission, market), e => e instanceof Error && "code" in e && e.code === "MARKET_SOURCE_UNVERIFIED");
});
test("fails closed when System One blocks, requests review, or is unavailable", async () => {
  const { runtime: denied } = await make("5000000", async () => ({
    allowed: false, outcome: "review", confidence: 0.99, decisionId: "guard-2", signatureKind: "provider_tee",
  }));
  await assert.rejects(() => denied.propose(request, permission, market), e => e instanceof Error && "code" in e && e.code === "GUARDRAIL_REJECTED");
  const { runtime: unavailable } = await make("5000000", async () => { throw new Error("offline"); });
  await assert.rejects(() => unavailable.propose(request, permission, market), e => e instanceof Error && "code" in e && e.code === "GUARDRAIL_UNAVAILABLE");
});
