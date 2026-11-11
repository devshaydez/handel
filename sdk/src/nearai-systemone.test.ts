import test from "node:test";
import assert from "node:assert/strict";
import { NearAiSystemOneGuard, type NearAiSystemOneClient } from "./nearai-systemone.js";
import { NearAiBudgetLedger } from "./nearai-provider.js";

const budget = { budgetMicros: 10_000_000, maxRequestCostMicros: 100_000, maxRequests: 100, maxCompletionTokens: 512, maxPromptBytes: 12000 };
const config = {
  apiKey: "test", model: "jev/handel-guard",
  signaturePolicy: "provider_tee" as const, allowedGatewaySigners: ["gateway"], allowedModelSigners: ["signer"],
  allowedComposeHashes: ["compose"], allowedOsImageHashes: ["os"],
};
function client(choice = "allow", confidence = 0.95): NearAiSystemOneClient {
  return {
    verify: async () => ({
      gateway: { tcbStatus: "UpToDate", signer: { signingAddress: "gateway" } },
      models: [{
        tcbStatus: "UpToDate", signer: { signingAddress: "signer" },
        deployment: { runtimeMeasurements: { composeHash: "compose", osImageHash: "os" } },
      }],
    }),
    systemone: {
      create: async () => ({
        decisionId: "decision-1",
        data: { answers: { guard: { type: "choice", choice, confidence } } },
      }),
    },
    verifyResponse: async () => ({ signatureKind: "provider_tee" }),
  };
}
function guard(c = client(), ledger = new NearAiBudgetLedger(budget), overrides = {}) {
  return new NearAiSystemOneGuard({ ...config, ...overrides }, c, ledger);
}

test("accepts only a verified, allowlisted, high-confidence System One allow decision", async () => {
  const result = await guard().evaluate({ proposal: "test" });
  assert.equal(result.allowed, true);
  assert.equal(result.signatureKind, "provider_tee");
  assert.equal(result.usage.requestsReserved, 1);
});
test("blocks block, review, and low-confidence outcomes", async () => {
  assert.equal((await guard(client("block", 0.99)).evaluate({})).allowed, false);
  assert.equal((await guard(client("review", 0.99)).evaluate({})).allowed, false);
  assert.equal((await guard(client("allow", 0.4)).evaluate({})).allowed, false);
});
test("fails closed on missing model attestation, bad Gateway/model signer, and Gateway-only receipt", async () => {
  const missing = client();
  missing.verify = async () => ({ gateway: { tcbStatus: "UpToDate", signer: { signingAddress: "gateway" } }, models: [] });
  await assert.rejects(() => guard(missing).evaluate({}), /TEE attestation/);

  const badGateway = client();
  badGateway.verify = async () => ({
    gateway: { tcbStatus: "UpToDate", signer: { signingAddress: "other-gateway" } },
    models: [{ tcbStatus: "UpToDate", signer: { signingAddress: "signer" }, deployment: { runtimeMeasurements: { composeHash: "compose", osImageHash: "os" } } }],
  });
  await assert.rejects(() => guard(badGateway).evaluate({}), /Gateway signer is not allowlisted/);

  const badSigner = client();
  badSigner.verify = async () => ({
    gateway: { tcbStatus: "UpToDate", signer: { signingAddress: "gateway" } },
    models: [{ tcbStatus: "UpToDate", signer: { signingAddress: "other" } }],
  });
  await assert.rejects(() => guard(badSigner).evaluate({}), /signer is not allowlisted/);

  const receipt = client();
  receipt.verifyResponse = async () => ({ signatureKind: "gateway" });
  await assert.rejects(() => guard(receipt).evaluate({}), /signature does not match configured policy/);
});
test("supports explicit Gateway-signed Jev decisions without pretending the model itself is TEE-attested", async () => {
  const gatewayClient = client();
  gatewayClient.verify = async () => ({
    gateway: { tcbStatus: "UpToDate", signer: { signingAddress: "gateway" } },
    models: [],
  });
  gatewayClient.verifyResponse = async () => ({ signatureKind: "gateway" });
  const result = await guard(gatewayClient, new NearAiBudgetLedger(budget), {
    signaturePolicy: "gateway",
    allowedModelSigners: undefined,
    allowedComposeHashes: undefined,
    allowedOsImageHashes: undefined,
  }).evaluate({ proposal: "screen only" });
  assert.equal(result.allowed, true);
  assert.equal(result.signatureKind, "gateway");
});
test("Gateway-only receipt is rejected unless Gateway policy is explicitly selected", async () => {
  const gatewayReceipt = client();
  gatewayReceipt.verifyResponse = async () => ({ signatureKind: "gateway" });
  await assert.rejects(() => guard(gatewayReceipt).evaluate({}), /signature does not match configured policy/);
});
test("enforces state-size and shared Chat/System One budget caps", async () => {
  await assert.rejects(() => guard(client(), new NearAiBudgetLedger(budget), { maxStateBytes: 1 }).evaluate({ tooLarge: true }), /byte cap/);
  const shared = new NearAiBudgetLedger({ ...budget, budgetMicros: 200000, maxRequestCostMicros: 100000, maxRequests: 2 });
  await guard(client(), shared).evaluate({});
  await guard(client(), shared).evaluate({});
  assert.throws(() => shared.reserve(), /budget exhausted/);
});
