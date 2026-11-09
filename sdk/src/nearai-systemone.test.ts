import test from "node:test";
import assert from "node:assert/strict";
import { NearAiSystemOneGuard, type NearAiSystemOneClient } from "./nearai-systemone.js";

const config = {
  apiKey: "test",
  model: "jev/handel-guard",
  allowedModelSigners: ["signer"],
  allowedComposeHashes: ["compose"],
  allowedOsImageHashes: ["os"],
};
function client(overrides: Partial<NearAiSystemOneClient> = {}): NearAiSystemOneClient {
  return {
    verify: async () => ({
      gateway: { tcbStatus: "UpToDate" },
      models: [{ tcbStatus: "UpToDate", signer: { signingAddress: "signer" }, deployment: { runtimeMeasurements: { composeHash: "compose", osImageHash: "os" } } }],
    }),
    systemone: { create: async () => ({ decisionId: "decision-1", data: { answers: { guard: { type: "choice", choice: "allow", confidence: 0.95 } } } }) },
    verifyResponse: async () => ({ signatureKind: "provider_tee" }),
    ...overrides,
  } as NearAiSystemOneClient;
}
test("accepts only a verified, allowlisted high-confidence System One allow decision", async () => {
  const result = await new NearAiSystemOneGuard(config, client()).evaluate({ proposal: "test" });
  assert.equal(result.allowed, true);
  assert.equal(result.signatureKind, "provider_tee");
});
test("blocks block/review/low-confidence outcomes", async () => {
  const block = new NearAiSystemOneGuard(config, client({ systemone: { create: async () => ({ decisionId: "d", data: { answers: { guard: { type: "choice", choice: "block", confidence: 0.99 } } }) } } }));
  assert.equal((await block.evaluate({})).allowed, false);
  const review = new NearAiSystemOneGuard(config, client({ systemone: { create: async () => ({ decisionId: "d", data: { answers: { guard: { type: "choice", choice: "review", confidence: 0.99 } } }) } } }));
  assert.equal((await review.evaluate({})).allowed, false);
  const uncertain = new NearAiSystemOneGuard(config, client({ systemone: { create: async () => ({ decisionId: "d", data: { answers: { guard: { type: "choice", choice: "allow", confidence: 0.4 } } }) } } }));
  assert.equal((await uncertain.evaluate({})).allowed, false);
});
test("fails closed on missing model attestation, bad signer and receipt", async () => {
  const noModel = new NearAiSystemOneGuard(config, client({ verify: async () => ({ gateway: { tcbStatus: "UpToDate" }, models: [] }) }));
  await assert.rejects(() => noModel.evaluate({}), /TEE attestation/);
  const badSigner = new NearAiSystemOneGuard(config, client({ verify: async () => ({ gateway: { tcbStatus: "UpToDate" }, models: [{ tcbStatus: "UpToDate", signer: { signingAddress: "other" } }] }) }));
  await assert.rejects(() => badSigner.evaluate({}), /signer is not allowlisted/);
  const badReceipt = new NearAiSystemOneGuard(config, client({ verifyResponse: async () => ({ signatureKind: "gateway" }) }));
  await assert.rejects(() => badReceipt.evaluate({}), /not provider-TEE signed/);
});
