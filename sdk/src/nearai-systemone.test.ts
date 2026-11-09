import test from "node:test";
import assert from "node:assert/strict";
import { NearAiSystemOneGuard, type NearAiSystemOneClient } from "./nearai-systemone.js";

const config = {
  apiKey: "test",
  model: "jev/handel-guard",
  allowedGatewaySigners: ["gateway"],
  allowedModelSigners: ["signer"],
  allowedComposeHashes: ["compose"],
  allowedOsImageHashes: ["os"],
};

function client(choice = "allow", confidence = 0.95): NearAiSystemOneClient {
  return {
    verify: async () => ({
      gateway: { tcbStatus: "UpToDate", signer: { signingAddress: "gateway" } },
      models: [{
        tcbStatus: "UpToDate",
        signer: { signingAddress: "signer" },
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

test("accepts only a verified, allowlisted, high-confidence System One allow decision", async () => {
  const result = await new NearAiSystemOneGuard(config, client()).evaluate({ proposal: "test" });
  assert.equal(result.allowed, true);
  assert.equal(result.signatureKind, "provider_tee");
});

test("blocks block, review, and low-confidence outcomes", async () => {
  assert.equal((await new NearAiSystemOneGuard(config, client("block", 0.99)).evaluate({})).allowed, false);
  assert.equal((await new NearAiSystemOneGuard(config, client("review", 0.99)).evaluate({})).allowed, false);
  assert.equal((await new NearAiSystemOneGuard(config, client("allow", 0.4)).evaluate({})).allowed, false);
});

test("fails closed on missing model attestation, bad signer, and Gateway-only receipt", async () => {
  const missing = client();
  missing.verify = async () => ({ gateway: { tcbStatus: "UpToDate", signer: { signingAddress: "gateway" } }, models: [] });
  await assert.rejects(() => new NearAiSystemOneGuard(config, missing).evaluate({}), /TEE attestation/);

  const signer = client();
  signer.verify = async () => ({
    gateway: { tcbStatus: "UpToDate", signer: { signingAddress: "gateway" } },
    models: [{ tcbStatus: "UpToDate", signer: { signingAddress: "other" } }],
  });
  await assert.rejects(() => new NearAiSystemOneGuard(config, signer).evaluate({}), /signer is not allowlisted/);

  const receipt = client();
  receipt.verifyResponse = async () => ({ signatureKind: "gateway" });
  await assert.rejects(() => new NearAiSystemOneGuard(config, receipt).evaluate({}), /not provider-TEE signed/);
});
