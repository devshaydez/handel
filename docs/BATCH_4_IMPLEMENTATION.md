# Batch 4 — AI integration, application boundary, adversarial tests

**Branch:** `work/batch-4-ai-integration-adversarial`  
**Base:** Batch 3 PR #4 head `7bff578cadaa19faa17e13b46a4b6a7932340aa1`  
**Status:** Implementation staged; CI and independent review pending.

## Phase 10 — AI provider boundary
- Provider-neutral SDK client for a Handel-controlled backend gateway; no vendor-specific browser calls.
- HTTPS enforcement (localhost development exception), bearer auth, timeout, response-size bound, process-local rate limit, strict schema/model validation, stable error codes, and SHA-256 request/response provenance.
- Deterministic fallback when no key is configured; no network request is made. Configured-provider failures fail closed.
- Tests cover fallback, success/provenance, unexpected fields, model mismatch, malformed JSON, oversized payload, upstream failure, and rate limits.

**Not delivered:** live gateway deployment, selected provider/vendor, credentials, shared rate limiting, budget/quota policy, durable audit sink, production monitoring, or live-provider contract test.

## Phase 11 — UI/backend boundary
- Typed proposal preparation/preview validates policy and holder account.
- Signing is a separate callback requiring explicit principal approval; only exact reviewed method/arguments are passed to a connected-wallet adapter. No SDK key custody or server-side signing.
- Tests prove signer is not invoked when approval is false.

**Not delivered:** no existing UI application is present in this repository tree. Actual UI screens, wallet adapter, position indexer/queries, status subscriptions, recovery UX, and production API deployment require the UI/backend repository.

## Phase 12 — adversarial tests
- Policy parsing now rejects malformed, zero, oversized and uint256-overflow integer strings; checks agent limits and expiry ranges.
- New deterministic boundary sweep and adversarial policy tests plus gateway/schema and approval-gating tests.
- Existing orchestration tests continue covering operation collisions, definitive-failure-only retry, unknown-outcome no-retry, event replay conflict/gap, and snapshot restoration.

**Still required:** comprehensive property/fuzz tests, malicious NEP-141 callback payload regressions, every timestamp overflow path, callback-order permutations, full partial/ambiguous payout state-machine exploration, and regressions for all confirmed security findings.

## Release boundary
CI/Sandbox success does not establish live provider configuration, UI integration, Testnet deployment, real-asset route support, or Mainnet readiness. Model output must never set principal, recipient, permissions, reconciliation evidence, or authorize custody/settlement. Contract policy and explicit principal approval remain authoritative.
