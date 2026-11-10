#!/usr/bin/env node
/**
 * Low-cost live NEAR AI TEE inference smoke.
 * Uses a public, catalogued verifiable text model; sends no wallet/account data,
 * no trading prompt, and no order/transaction. It is discovery evidence only:
 * Handel's governance signer/measurement allowlists remain a separate gate.
 */
import { InferenceClient } from "@nearai/inference-sdk/node";

const apiKey = process.env.NEARAI_API_KEY;
const model = process.env.NEARAI_SMOKE_MODEL ?? "deepseek-ai/DeepSeek-V4.1-Flash-1017";
const baseUrl = process.env.NEARAI_BASE_URL ?? "https://cloud-api.near.ai/v1";
if (!apiKey?.trim()) throw new Error("NEARAI_API_KEY is unavailable.");
if (!baseUrl.startsWith("https://")) throw new Error("NEAR AI endpoint must use HTTPS.");

const client = new InferenceClient({
  apiKey,
  baseUrl,
  e2ee: true,
  ohttp: true,
  signingAlgo: "ed25519",
  attestationCacheTimeToLiveMs: 0,
  gatewayVerification: { policy: { acceptedTcbStatuses: ["UpToDate"] } },
  modelVerification: {
    policy: { acceptedTcbStatuses: ["UpToDate"], gpuEvidence: "required" },
  },
});

const deployment = await client.verify(model);
if (deployment?.gateway?.tcbStatus !== "UpToDate") {
  throw new Error("Gateway TCB is not UpToDate.");
}
if (!deployment.models?.length || deployment.models.some((m) => m.tcbStatus !== "UpToDate")) {
  throw new Error("Model deployment is missing or not UpToDate.");
}
for (const m of deployment.models) {
  if (!m.signer?.signingAddress || !m.deployment?.runtimeMeasurements?.composeHash ||
      !m.deployment?.runtimeMeasurements?.osImageHash) {
    throw new Error("TEE deployment evidence is incomplete.");
  }
}
console.log("NEAR AI Gateway/model attestation: PASS");
console.log(JSON.stringify({
  model,
  gatewayTcbStatus: deployment.gateway.tcbStatus,
  gatewaySigner: deployment.gateway.signer?.signingAddress ?? null,
  models: deployment.models.map((m) => ({
    tcbStatus: m.tcbStatus,
    signer: m.signer?.signingAddress ?? null,
    composeHash: m.deployment?.runtimeMeasurements?.composeHash ?? null,
    osImageHash: m.deployment?.runtimeMeasurements?.osImageHash ?? null,
  })),
  verifiedAt: deployment.verifiedAt ?? null,
  privacy: { e2ee: true, ohttp: true, signingAlgo: "ed25519", attestationCacheTimeToLiveMs: 0 },
}, null, 2));

const completion = await client.chat.completions.create({
  model,
  messages: [{ role: "user", content: "For a connectivity check only, reply with exactly this text and nothing else: HANDEL_NEARAI_SMOKE_OK" }],
  temperature: 0,
  max_tokens: 32,
});
if (!completion?.id) throw new Error("NEAR AI completion ID is missing.");
const receipt = await client.verifyResponse(completion.id);
if (receipt?.signatureKind !== "provider_tee") {
  throw new Error(`Expected provider_tee response signature; received ${receipt?.signatureKind ?? "none"}.`);
}
const output = completion.choices?.[0]?.message?.content?.trim();
if (output !== "HANDEL_NEARAI_SMOKE_OK") {
  throw new Error("Live inference returned an unexpected smoke response.");
}
console.log("Live E2EE/OHTTP inference: PASS");
console.log("Provider TEE response signature: PASS");
console.log("Response content: HANDEL_NEARAI_SMOKE_OK");
console.log("No wallet, market data, trade proposal, or transaction was involved.");
console.log("NOTE: this smoke does not approve Handel signer/measurement allowlists or validate the full agent runtime.");
