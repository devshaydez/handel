import test from "node:test";
import assert from "node:assert/strict";
import { NearAiBudgetLedger, NearAiProposalProvider, NearAiError, type NearAiClient } from "./nearai-provider.js";
import { stubProposal } from "./proposal.js";
import { NVDAON_ASSET_ID } from "./assets.js";

const p = stubProposal({ underlyingAssetId: NVDAON_ASSET_ID, daysToExpiry: 3 });
const budget = { budgetMicros: 10_000_000, maxRequestCostMicros: 100_000, maxRequests: 100, maxCompletionTokens: 512, maxPromptBytes: 12000 };
const allow = { allowedModelSigners: ["signer-1"], allowedComposeHashes: ["compose-1"], allowedOsImageHashes: ["os-1"] };
function fake(o: Partial<NearAiClient> = {}): NearAiClient {
  return {
    verify: async () => ({
      gateway: { tcbStatus: "UpToDate" },
      models: [{ signer: { signingAddress: "signer-1" }, tcbStatus: "UpToDate", deployment: { runtimeMeasurements: { composeHash: "compose-1", osImageHash: "os-1" } } }],
      verifiedAt: 123,
    }),
    chat: { completions: { create: async () => ({ id: "req-1", choices: [{ message: { content: JSON.stringify(p) } }] }) } },
    verifyResponse: async () => ({ signatureKind: "provider_tee" }),
    ...o,
  } as NearAiClient;
}
const config = { apiKey: "fake", model: "test/model", budget, ...allow };

test("requires allowlisted, up-to-date Gateway and model TEE evidence", async () => {
  const provider = new NearAiProposalProvider(config, fake());
  const result = await provider.propose({ asset: NVDAON_ASSET_ID });
  assert.equal(result.verification.signatureKind, "provider_tee");
  assert.deepEqual(result.privacy, { e2ee: true, ohttp: true, signingAlgo: "ed25519" });
  assert.equal(result.usage.reservedCostMicros, 100000);
});
test("rejects missing deployment allowlists", () => {
  assert.throws(() => new NearAiProposalProvider({ ...config, allowedComposeHashes: [] }, fake()), e => e instanceof NearAiError && e.code === "DEPLOYMENT_ALLOWLIST_REQUIRED");
});
test("blocks un-attested models and Gateway-only responses", async () => {
  const a = new NearAiProposalProvider(config, fake({ verify: async () => ({ gateway: { tcbStatus: "UpToDate" }, models: [] }) }));
  await assert.rejects(() => a.propose({}), e => e instanceof NearAiError && e.code === "MODEL_NOT_ATTESTED");
  const b = new NearAiProposalProvider(config, fake({ verifyResponse: async () => ({ signatureKind: "gateway" }) }));
  await assert.rejects(() => b.propose({}), e => e instanceof NearAiError && e.code === "MODEL_SIGNATURE_REQUIRED");
});
test("rejects revoked, stale-policy and unapproved signer or measurements", async () => {
  const gateway = new NearAiProposalProvider(config, fake({ verify: async () => ({ gateway: { tcbStatus: "Revoked" }, models: [{ tcbStatus: "UpToDate" }] }) }));
  await assert.rejects(() => gateway.propose({}), e => e.code === "GATEWAY_TCB_REJECTED");
  const tcb = new NearAiProposalProvider(config, fake({ verify: async () => ({ gateway: { tcbStatus: "UpToDate" }, models: [{ tcbStatus: "OutOfDate" }] }) }));
  await assert.rejects(() => tcb.propose({}), e => e.code === "MODEL_TCB_REJECTED");
  const signer = new NearAiProposalProvider(config, fake({ verify: async () => ({ gateway: { tcbStatus: "UpToDate" }, models: [{ tcbStatus: "UpToDate", signer: { signingAddress: "unknown" } }] }) }));
  await assert.rejects(() => signer.propose({}), e => e.code === "MODEL_SIGNER_REJECTED");
  const measurement = new NearAiProposalProvider(config, fake({ verify: async () => ({ gateway: { tcbStatus: "UpToDate" }, models: [{ tcbStatus: "UpToDate", signer: { signingAddress: "signer-1" }, deployment: { runtimeMeasurements: { composeHash: "bad", osImageHash: "os-1" } } }] }) }));
  await assert.rejects(() => measurement.propose({}), e => e.code === "DEPLOYMENT_MEASUREMENT_REJECTED");
});
test("fails closed on verification errors and signature failures", async () => {
  const a = new NearAiProposalProvider(config, fake({ verify: async () => { throw Error(); } }));
  await assert.rejects(() => a.propose({}), e => e.code === "ATTESTATION_FAILED");
  const b = new NearAiProposalProvider(config, fake({ verifyResponse: async () => { throw Error(); } }));
  await assert.rejects(() => b.propose({}), e => e.code === "RESPONSE_UNVERIFIED");
});
test("budget reservations are conservative and never refunded", () => {
  const ledger = new NearAiBudgetLedger({ ...budget, maxRequests: 2, maxRequestCostMicros: 5000000 });
  ledger.reserve(); ledger.reserve();
  assert.equal(ledger.snapshot().reservedCostMicros, 10000000);
  assert.throws(() => ledger.reserve(), e => e instanceof NearAiError && e.code === "BUDGET_EXHAUSTED");
});
test("rejects unsafe endpoint and oversized prompt", async () => {
  assert.throws(() => new NearAiProposalProvider({ ...config, baseUrl: "http://bad" }, fake()), NearAiError);
  const provider = new NearAiProposalProvider({ ...config, budget: { ...budget, maxPromptBytes: 1 } }, fake());
  await assert.rejects(() => provider.propose({ a: 1 }), e => e.code === "PROMPT_TOO_LARGE");
});
