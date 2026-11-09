# NEAR AI security integration — Batch 8

**Status:** Offline implementation and tests are in progress. Chat E2EE/OHTTP, explicit TEE deployment pinning, and a fail-closed System One proposal guard are implemented on the Batch 8 branch. Live Gateway inference and live System One decisions have not been run.

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
- `NEARAI_MODEL` (canonical Gateway model ID).
- `NEARAI_ALLOWED_MODEL_SIGNERS`.
- `NEARAI_ALLOWED_COMPOSE_HASHES`.
- `NEARAI_ALLOWED_OS_IMAGE_HASHES`.
- A budget ceiling derived from current provider pricing.

The deployment allowlists must be populated from a deployment independently reviewed and approved by Handel. Do not copy arbitrary measurements from an untrusted response just to make verification pass.

## Verification status and limitations

- Offline unit tests use a fake SDK client; they prove rejection behavior, not that a remote TEE is honest.
- No live inference request or System One decision has been sent.
- No live E2EE/OHTTP key exchange has been observed end-to-end yet.
- The budget ledger remains process-local and must be replaced with durable shared accounting before multi-instance production use.
- The System One structured guardrail adapter is implemented and trading proposal runtime now requires an allowlisted, verified provider-TEE System One decision. Live model compatibility and receipt verification still require a credentialed smoke test.
- TEE attestation does not grant wallet authority. On-chain policy, user approval, deterministic limits, and verified settlement remain mandatory.
