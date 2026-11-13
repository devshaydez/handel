# NEAR AI security integration — Batch 8

**Status (2026-11-13):** Chat E2EE/OHTTP, explicit Gateway/model TEE deployment pinning, response-signature verification, and the separate System One decision path are implemented in the current SDK. The evidence ledger records a successful live NEAR AI → SDK → Sandbox CI proof (E-001). This proves the named CI proof only; it is not evidence of a completed Testnet trade, Ondo settlement, or production custody. System One uses its own client with E2EE/OHTTP disabled and Gateway-signature verification; do not describe it as model-TEE-attested.

## Verified SDK contract

Handel targets `@nearai/inference-sdk@0.3.0` from the official Node entrypoint. This SDK requires Node.js `>=24.22.1`.

For Chat Completions, the official SDK supports:
- `e2ee: true` for field-level encryption of supported Chat fields to a verified model key.
- `ohttp: true` for OHTTP encapsulation of Chat requests and responses. OHTTP requires Ed25519.
- `verify(model)` for Gateway and eligible model attestation.
- `deploymentPolicy` / `modelVerification.verifiers.deployment` for application-owned deployment policy.
- `verifyResponse(completion.id)` for byte-exact response signature verification.

Handel configures a zero-millisecond attestation cache by default, requires `UpToDate` TCB for Gateway and model, requires GPU evidence, and additionally checks allowlisted model signer, compose hash, and OS image hash. Empty allowlists are rejected. Provider TEE response signatures are mandatory by default; a Gateway-only receipt cannot satisfy the trading proposal path.

OHTTP protects the HTTP exchange to the Gateway. It does not conceal outer authorization headers or the client's network address. E2EE protects supported Chat fields; other headers and unsupported fields remain outside its protection. Neither feature establishes trading correctness or execution authority.

## System One boundary

System One is a separate structured decision API. The official SDK requires a separate client with `e2ee: false` and `ohttp: false`. Its `decisionId` must be passed to `verifyResponse` before any decision is consumed. A guardrail decision is an additional safety signal, not a replacement for Handel's deterministic risk checks, user permissions, or on-chain contract enforcement.

## Configuration required before live use

Provide the approved model identity and measured deployment values through protected runtime configuration:
- `NEARAI_API_KEY` (secret; never commit it).
- `NEARAI_MODEL` (canonical Chat model ID).
- `NEARAI_SYSTEMONE_MODEL` (canonical System One decision model ID).
- `NEARAI_ALLOWED_GATEWAY_SIGNERS`.
- `NEARAI_ALLOWED_MODEL_SIGNERS`.
- `NEARAI_ALLOWED_COMPOSE_HASHES`.
- `NEARAI_ALLOWED_OS_IMAGE_HASHES`.
- Separate `NEARAI_SYSTEMONE_ALLOWED_GATEWAY_SIGNERS`, `NEARAI_SYSTEMONE_ALLOWED_MODEL_SIGNERS`, `NEARAI_SYSTEMONE_ALLOWED_COMPOSE_HASHES`, and `NEARAI_SYSTEMONE_ALLOWED_OS_IMAGE_HASHES` for the System One deployment; do not reuse Chat allowlists unless the verified signer/measurement evidence is exactly the same.
- A budget ceiling derived from current provider pricing. Create one `NearAiBudgetLedger` and pass the same instance to both `NearAiProposalProvider` and `NearAiSystemOneGuard` so chat and guardrail calls consume one shared cap. System One state is byte-capped (16 KB by default).

The deployment allowlists must be populated from a deployment independently reviewed and approved by Handel. Do not copy arbitrary measurements from an untrusted response just to make verification pass.

## Verification status and limitations

- Offline unit tests use a fake SDK client; they prove rejection behavior, not that a remote TEE is honest.
- The live NEAR AI → SDK → Sandbox proof is recorded in [EVIDENCE.md](./EVIDENCE.md#e-001--latest-main-ci); do not generalize that CI result into proof of a completed Testnet trade or production service.
- Chat configures E2EE/OHTTP and provider tests assert the privacy metadata; the E-001 proof is the available live-integration evidence. No independent security audit is claimed.
- The budget ledger is shareable across Chat and System One within one process, but remains process-local and must be replaced with durable shared accounting before multi-instance production use.
- The System One structured guardrail adapter is implemented and trading proposal runtime now requires an allowlisted, verified provider-TEE System One decision.
- Trading proposal runtime also requires a durable decision recorder; records are hash-chained and explanations are rendered from stored evidence. A host must provide durable storage and production WORM/anchoring controls.
- Trading proposal runtime now also requires a source-specific market evidence verifier returning an approval result, verification method, and evidence hash. No current live provider is approved; display-only sources cannot be used by a verifier as execution-grade inputs.
- Live integration evidence is limited to the CI proof recorded in E-001; broader production compatibility, independent review, and operational hardening remain open.
- TEE attestation does not grant wallet authority. On-chain policy, user approval, deterministic limits, and verified settlement remain mandatory.
