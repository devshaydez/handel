#!/usr/bin/env node
/**
 * Credential-only NEAR AI preflight.
 * This intentionally performs no inference and never prints the API key.
 * It confirms that the repository secret authenticates against the official
 * model catalogue, then emits a bounded, redacted catalogue snapshot for
 * selecting an approved Chat and System One deployment.
 */
const base = (process.env.NEARAI_BASE_URL ?? "https://cloud-api.near.ai/v1").replace(/\/$/, "");
const key = process.env.NEARAI_API_KEY;
if (!key || !key.trim()) {
  console.error("BLOCKED: NEARAI_API_KEY is not available to this workflow.");
  process.exit(2);
}
if (!base.startsWith("https://")) {
  console.error("BLOCKED: NEAR AI endpoint must use HTTPS.");
  process.exit(2);
}
const response = await fetch(`${base}/model/list`, {
  method: "GET",
  headers: { authorization: `Bearer ${key}`, accept: "application/json" },
  signal: AbortSignal.timeout(20_000),
});
if (!response.ok) {
  const body = (await response.text()).slice(0, 1200).replace(/\bBearer\s+\S+/gi, "Bearer [REDACTED]");
  console.error(`NEAR AI model catalogue request failed: HTTP ${response.status}`);
  if (body) console.error(body);
  process.exit(1);
}
let catalogue;
try { catalogue = await response.json(); }
catch {
  console.error("NEAR AI model catalogue returned a non-JSON response.");
  process.exit(1);
}
if (!catalogue || typeof catalogue !== "object") {
  console.error("NEAR AI model catalogue response has an invalid shape.");
  process.exit(1);
}
const redact = (value) => {
  if (Array.isArray(value)) return value.slice(0, 100).map(redact);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (/api.?key|token|secret|authorization|credential/i.test(k)) out[k] = "[REDACTED]";
      else out[k] = redact(v);
    }
    return out;
  }
  return value;
};
const models = Array.isArray(catalogue.models) ? catalogue.models : [];
const summary = models.map((m) => ({
  modelId: m?.modelId ?? null,
  displayName: m?.metadata?.modelDisplayName ?? null,
  verifiable: m?.metadata?.verifiable ?? null,
  attestationSupported: m?.attestationSupported ?? null,
  providerType: m?.providerType ?? null,
  ready: m?.isReady ?? null,
  inputModalities: m?.architecture?.inputModalities ?? [],
  outputModalities: m?.architecture?.outputModalities ?? [],
  supportedFeatures: m?.supportedFeatures ?? m?.architecture?.supportedFeatures ?? [],
  task: m?.task ?? m?.metadata?.task ?? null,
}));
console.log(`NEAR AI model catalogue authenticated: ${models.length} entries.`);
console.log("Only non-secret model identity/capability fields are emitted:");
console.log(JSON.stringify(summary, null, 2));
