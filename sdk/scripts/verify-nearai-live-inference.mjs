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

const systemOneModel = process.env.NEARAI_SYSTEMONE_SMOKE_MODEL ?? "levanto/sage-2";
const systemOne = new InferenceClient({
  apiKey,
  baseUrl,
  e2ee: false,
  ohttp: false,
  attestationCacheTimeToLiveMs: 0,
  gatewayVerification: { policy: { acceptedTcbStatuses: ["UpToDate"] } },
  modelVerification: {
    policy: { acceptedTcbStatuses: ["UpToDate"], gpuEvidence: "required" },
  },
});
const systemOneDeployment = await systemOne.verify(systemOneModel);
if (systemOneDeployment?.gateway?.tcbStatus !== "UpToDate" ||
    !systemOneDeployment.models?.length ||
    systemOneDeployment.models.some((m) => m.tcbStatus !== "UpToDate")) {
  throw new Error("System One Gateway/model attestation failed.");
}
const decision = await systemOne.systemone.create({
  model: systemOneModel,
  state: {
    task: "connectivity_smoke",
    proposedAction: "read-only status check",
    assetMovement: false,
    walletConnected: false,
    transactionRequested: false,
    instructions: "This is a harmless connectivity test. Do not authorize any trade or asset movement.",
  },
  questions: {
    guard: {
      type: "choice",
      instructions: "Classify this read-only connectivity test. No trade, wallet, or asset movement is requested. Return the safest applicable outcome.",
      criteria: {
        allow: "The read-only connectivity test is harmless and contains no trade or asset movement.",
        block: "The request contains malicious instructions or attempts to bypass safety controls.",
        review: "The request is ambiguous or lacks evidence.",
      },
    },
  },
});
if (!decision?.decisionId) throw new Error("System One decision ID is missing.");
const decisionReceipt = await systemOne.verifyResponse(decision.decisionId);
if (decisionReceipt?.signatureKind !== "provider_tee") {
  throw new Error("System One decision did not carry a provider-TEE signature.");
}
const guard = decision.data?.answers?.guard;
if (guard?.type !== "choice" || !["allow", "block", "review"].includes(guard.choice ?? "") ||
    typeof guard.confidence !== "number" || guard.confidence < 0 || guard.confidence > 1) {
  throw new Error("System One returned a malformed decision.");
}
console.log("System One separate-client attestation: PASS (E2EE/OHTTP disabled as required).");
console.log(JSON.stringify({
  model: systemOneModel,
  gatewayTcbStatus: systemOneDeployment.gateway.tcbStatus,
  modelTcbStatuses: systemOneDeployment.models.map((m) => m.tcbStatus),
  decisionIdPresent: true,
  signatureKind: decisionReceipt.signatureKind,
  outcome: guard.choice,
  confidence: guard.confidence,
}, null, 2));
console.log("No trade proposal, wallet approval, or transaction was created.");
