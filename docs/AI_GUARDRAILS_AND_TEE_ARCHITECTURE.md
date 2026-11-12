# Handel AI guardrails and NEAR confidential-inference architecture

Status: architecture and implementation requirements. This document does not claim that every integration below is already implemented or enabled.

## 1. What NEAR AI Cloud gives Handel

NEAR AI Cloud provides an OpenAI-compatible inference gateway and attestation tooling for supported private/TEE model routes. The current official JavaScript SDK supports:

- **Gateway attestation before inference**: verify the Gateway TEE evidence and signer identity.
- **Model attestation before inference**: for supported attested model deployments, verify model evidence and signer identity. The SDK must fail closed if required model evidence is missing or invalid.
- **Signed response verification**: verify the exact request/response bytes using the completion ID. A `provider_tee` receipt binds those bytes to the attested model signer; a `gateway` receipt proves only that the Gateway signed those bytes.
- **Field-level E2EE for supported Chat fields**: `e2ee: true` encrypts supported request fields to the attested model key. This is separate from TLS.
- **Oblivious HTTP (OHTTP)**: `ohttp: true` protects the HTTP exchange to the Gateway; it is independent of E2EE and currently requires Ed25519.
- **Deployment policy hooks**: application code can reject a model deployment whose measurements or signer do not meet an approved policy. The SDK does not enforce an approved-measurement allowlist by default.
- **Attestation caching**: deployment verification is cached for one hour by default; the client can use a shorter TTL or `attestationCacheTimeToLiveMs: 0` when each request must trigger a fresh verification.
- **Build/image provenance helpers**: the SDK exposes optional Sigstore/SLSA provenance verification for supported deployment images.

These controls are available only where the selected route/model supports them. Incognito routes do not provide model-level TEE attestation or a model-generated `provider_tee` signature. Handel must not silently downgrade to Gateway-only verification.

References:
- [NEAR AI Inference SDK verification guide](https://github.com/nearai/inference-sdk/blob/main/js/docs/verification-guide.md)
- [NEAR AI Inference SDK](https://github.com/nearai/inference-sdk)
- [NEAR AI Cloud](https://near.ai/)

## 2. What a TEE does not do

A TEE protects designated code and data while they execute in supported hardware and provides evidence about the environment. It does **not** prove that a trading recommendation is financially sound, that market data is true, that an LLM followed Handel's business rules, or that a transaction is authorised.

A TEE does not replace:
- deterministic contract permissions and revocation;
- asset allowlists, collateral checks, position caps, spend limits and risk policy;
- independent market-data provenance/freshness checks;
- deterministic premium and payoff calculations;
- tool-call authorisation and transaction simulation;
- wallet consent, signing, finality checks and settlement reconciliation;
- durable decision records and evidence-grounded explanations.

The model must never hold a user's private key or unrestricted wallet authority. The contract and trusted execution path—not model prose—must decide whether an action is permitted.

## 3. Handel's layered guardrail pipeline

Every proposed trade should pass these independent checkpoints:

1. **Input screening** — classify prompt injection, attempts to override policy, secret/data exfiltration, malicious retrieved content and out-of-scope requests. Treat news, webpages, token metadata and tool output as untrusted data, never as instructions.
2. **Agent reasoning** — the generative model can analyse the supplied facts and propose Buy Call, Buy Put, Write Call, Write Put, Hold/No Trade, Close or Exercise. It cannot invent data or execute tools directly.
3. **Evidence validation** — validate market-data source, asset identity, timestamp, freshness, quote units, liquidity and provenance. Missing or stale evidence means no trade.
4. **Structured decision check** — use a bounded decision model (where available) to classify the proposed action, detect policy bypass/tool misuse, check whether the rationale is supported by supplied evidence, and flag uncertainty. Treat this as a second opinion, not a proof of correctness.
5. **Deterministic risk and policy gate** — calculate premium/payoff/risk in trusted code; validate asset, quantity, collateral, premium, expiry, position count, exposure, user limits and current on-chain authority. Any failure blocks execution.
6. **Tool gate** — each tool call is separately allowlisted and schema-validated. Read-only tools are separated from signing/submission tools. The agent cannot turn a research tool into a transaction tool.
7. **Authority gate** — Education and Advisory modes cannot trade. Manual Approval requires principal approval for each proposal. Delegated mode requires explicit on-chain delegation and is bounded by contract limits and revocation.
8. **Execution and reconciliation** — simulate where supported, obtain required wallet consent, submit only the exact approved payload, and reconcile final transaction/receipt and balance evidence. Timeouts are unknown outcomes, never permission to duplicate a transfer.
9. **Output and audit gate** — check user-facing explanations for unsupported claims, distinguish proposal from execution, and append the evidence, policy decision, approval and transaction outcome to the durable decision record.

No single AI model—including a TEE-hosted model—can bypass these deterministic gates.

## 4. NEAR System One / Jev as an additional guardrail

NEAR AI's current Inference SDK exposes `client.systemone.create()` for Jev decision models. It verifies the required deployments using the client's attestation cache and policies before sending state. The result includes a `decisionId`; Handel must call `client.verifyResponse(result.decisionId)` and verify the receipt before using the answers. The NEAR Gateway path can use the same `NEARAI_API_KEY` and base URL as Chat inference.

The System One route must use a separate Gateway client configured with `e2ee: false` and `ohttp: false`; the current SDK does not support E2EE/OHTTP for System One. Send only the minimum structured state needed for the decision, never wallet secrets or private keys. The TypeSafe SDK can also use the Gateway client's `fetch` adapter. Separately, the System One ecosystem exposes typed Choice, Score and Noul/probability decisions. These are useful for fast, bounded checks such as:

- input: benign vs prompt injection vs jailbreak vs data exfiltration;
- tool gate: allowed read-only action vs forbidden signing/transfer action;
- trade review: permitted proposal class vs unsupported or out-of-policy action;
- evidence check: whether each material claim is supported by the supplied market snapshot;
- output: safe to show vs leaks secrets / unsupported claims / unsafe instructions.

A structured choice restricts the output space, but it does not make the classification infallible. Use it to block or escalate suspicious actions, not as the sole authoriser. A probability is not a trade instruction. Verify the decision receipt before using the answer. The NEAR Gateway `systemone.create()` route uses the same Gateway credential; a separate standalone TypeSafe endpoint may have its own credential and billing terms.

References: [NEAR AI SDK verification guide](https://github.com/nearai/inference-sdk/blob/main/js/docs/verification-guide.md), [System One agent guardrails pattern](https://www.systemone.dev/cookbook/agent-guardrails/).

## 5. Required Handel configuration

For sensitive user, wallet and portfolio context, the target NEAR AI Cloud configuration is:

- exact allowlisted model ID with model attestation support (reject Incognito/Gateway-only model routes);
- Gateway and model deployment verification before every uncached session;
- deployment policy pinned to reviewed model measurements/signer identity; the SDK's default policy does not pin an approved allowlist;
- `provider_tee` response signature required before the model output is used;
- E2EE enabled for supported Chat fields (E2EE is supported for Chat, not System One);
- OHTTP enabled for Chat where supported and configured with Ed25519; OHTTP protects the HTTP exchange to the Gateway but does not hide outer auth headers or the client's network address;
- no Incognito/Gateway-only fallback;
- bounded prompt size, output tokens, per-request cost, total budget and request count;
- shared durable budget ledger before multi-instance production use;
- no API keys in prompts, browser code, logs or repository files.

The current Batch 8 provider code requires model attestation and a `provider_tee` receipt by default, but its factory currently constructs the Chat client with `e2ee: false` and `ohttp: false`, does not configure a deployment-measurement allowlist, and uses the SDK's default one-hour attestation cache. Therefore application-level request encryption and OHTTP are **not yet enabled** in Handel. The System One decision route is also not integrated. The budget ledger is process-local. These must be addressed and tested before sensitive production traffic. When System One is added, it must use a separate client with E2EE/OHTTP disabled as required by the current SDK.

## 6. Implementation ownership

| Control | Enforced by | Required evidence |
|---|---|---|
| TEE and model identity | NEAR AI SDK + deployment policy | verified Gateway/model attestation |
| Exact response provenance | NEAR AI SDK | verified `provider_tee` receipt |
| Prompt confidentiality | E2EE/OHTTP configuration | SDK encryption path tests and live supported-model check |
| Input/tool/output screening | Handel agent runtime + optional System One decision service | adversarial tests and decision receipts |
| Trade authority | OptionsContract | on-chain mode, policy and revocation tests |
| Risk and pricing | deterministic Handel SDK/backend | independent test vectors and provider provenance |
| Transaction authority | connected wallet / separately audited delegated signer | signature and approval evidence |
| Settlement | Escrow, NEAR Intents and independent reconciler | final receipt and balance proof |
| Accountability | durable append-only decision journal | linked rationale, evidence, approval and outcome |

## 7. Current status and no-overclaim rule

- Batch 8 has an initial NEAR AI inference adapter, mocked attestation/signature tests and a host-side proposal runtime. No live inference has been performed.
- The user has added a GitHub Actions secret named `NEARAI_API_KEY`; this does not prove that the backend runtime has the secret or that a live call works.
- Handel has not yet integrated System One input/tool/output guardrails.
- E2EE and OHTTP are not yet enabled in the current provider factory.
- TEE verification does not establish trading correctness, market-data integrity, wallet authorisation, custody or settlement.
- No Mainnet transaction, real-asset custody or production trading readiness is claimed.

Close each item only with code, tests, and the appropriate live/independent evidence.