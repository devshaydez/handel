# Handel — project-wide limitations and release register

**Scope:** All work from Batch 1 through the remaining release phases (Phases 1–13).  
**Last reconciled:** 2026-11-09  
**Source of truth:** This document is the project-wide register. Batch implementation notes and the backend gap register provide technical detail; this file keeps every unfinished item visible across batches.

## Status rules

- **Implemented:** code is present; this alone does not mean independently validated.
- **CI/Sandbox validated:** the relevant automated checks or Sandbox scenarios passed on the stated commit.
- **External integration pending:** requires a real service, wallet, asset, deployed contract, or independently operated infrastructure.
- **Open limitation:** known incomplete work. Do not mark complete merely because an interface, mock, unit test, or dry-run exists.

## Batch 1 — Phases 1–3: premium lifecycle, cross-contract synchronization, payout recovery

PR #2 was squash-merged as `d9c188ba29e51d2e39a44146c37fbcfbe7138178`. Its recorded CI run passed Rust formatting/unit tests, optimized Wasm builds, callback-failure Wasm, Sandbox integration tests, SDK build/tests, and the offline lifecycle demo. Sandbox assets were mocks.

### Implemented / validated
- Persistent OptionsContract and Escrow position records with distinct storage prefixes.
- Idempotent OptionsContract-to-Escrow registration, immutable terms, pinned escrow/token accounts, callback handling, and retry.
- Versioned Escrow premium sidecar; exact holder/token/amount checks for premium intake; asynchronous premium payout/refund.
- Authenticated, sequenced Escrow lifecycle outbox with replay protection and permissionless resend of stored events.
- Evidence-attested recovery for ambiguous premium, exercise, and expiry payout outcomes.
- SDK operation journal and lifecycle event cursor; wallet signing remains external.
- Sandbox coverage for Call/Put premium/exercise lifecycle, replay/gap recovery, registration callback failure/retry, and expiry payout callback failure/reconciliation.

### Open limitations
1. **Expiry propagation is not fully end-to-end.** Escrow expiry release and OptionsContract Expired-event mapping have separate coverage, but the combined OptionsContract expiry-event propagation scenario remains open.
2. **Evidence attestation is a trust assumption.** The configured reconciler is human-governed; it is not a trustless proof or an independent source-chain verifier. A production verifier service, independent receipt inspection, and broader adversarial tests remain required.
3. **Payout legs are sequential and non-atomic.** Payment-to-writer and collateral-to-holder can partially settle. Definitive failures retry only the failed leg; ambiguous outcomes must remain frozen until independently evidenced. Token pause/blacklist, unavailable-recipient policy, compensation, and complete operational recovery remain open.
4. **Settlement-rail exclusivity needs full lifecycle proof.** The competing rail is blocked for registered escrow positions in tested paths, but reconfiguration, retries, every terminal state, and all lifecycle combinations need systematic double-execution tests.
5. **Registration recovery still needs deployed integration evidence.** Sandbox fault injection passes; a separate end-to-end deployment test has not been performed.
6. **Premium callback failure coverage is incomplete.** The premium lifecycle is Sandbox-tested, but dedicated premium callback-failure injection remains a release gate.
7. **Legacy storage migration is unresolved.** No exact legacy Borsh root-state migration or approved redeployment/migration plan has been completed.
8. **Production asset and token-account readiness is not established.** Tests use mock assets and pre-registered token accounts. Real token compatibility, NEP-145 registration/funding, payout-recipient storage failures, and real Testnet verification remain.

## Batch 2 — Phases 4–6: asset routes, settlement verification, transaction orchestration

PR #3 was squash-merged as `8d34211a3ca4729178a318da12c8777d33f27b52`. CI #275 passed on commit `8fe0f24`.

### Implemented / validated
- Tidepool 1Click-compatible Testnet adapter with live token discovery, dry quotes, explicit deposit-address opt-in, deposit notification/status polling, and MEMO validation.
- Settlement evidence binding operation/position/action/asset/amount/sender/receiver/transaction/receipt/event index, finality checks, replay protection, and durable evidence snapshots.
- NEAR FINAL-level receipt inspector with exact receipt selection, configured executor check, block identity validation, and strict `handel.settlement.v1` event decoding.
- Crash-safe wallet operation runner and durable file-backed journal; ambiguous submissions become `outcome_unknown` and are not automatically resubmitted.
- Wallet signing stays in the connected wallet; Handel does not custody wallet private keys.

### Open limitations
1. **No supported Ondo route.** Tidepool's published Testnet registry does not list Handel's Ondo stock identifiers (NVDAon, TSLAon, AAPLon, SPYon). Do not claim or attempt Ondo settlement until a supported route, exact token IDs/decimals, custody model, and enforceable per-position reservation are demonstrated.
2. **No live settlement event producer is deployed.** The inspector expects a canonical `handel.settlement.v1` event, but the current OptionsContract and Tidepool adapter do not emit it. The inspector is an integration boundary, not proof of a live settlement path.
3. **RPC trust is centralized.** A single RPC endpoint is an infrastructure trust assumption. Independent RPC operators/quorum, reorg/finality policy, and stronger verification (or a light client where appropriate) remain.
4. **Durable orchestration is not multi-instance production infrastructure.** The file snapshot store is single-process. A transactional database-backed store, hosted worker, locking/lease model, credential provisioning, and operational recovery remain.
5. **Wallet and event integration remain incomplete.** Production wallet selector integration, canonical event ingestion, escrow-state indexer, and definitive-failure-only retry worker are not deployed.
6. **No live Testnet proof.** No live Tidepool deposit, wallet-signed Testnet settlement, or Testnet contract deployment has been performed. Never send real assets to the community-operated custodial Testnet deposit adapter.

## Batch 3 — Phases 7–9: monitoring, storage economics, administrative security

PR #4 is open and unmerged. Its latest CI state must be checked against the current head before declaring the batch validated.

### Implemented in the current PR branch
- SDK operation/position status counters, configurable stuck-state thresholds, bounded in-memory event retention, and normalized event fields.
- Escrow per-position serialized-record storage-cost estimate using the current NEAR storage byte price; estimate-only and refund-unavailable are explicit.
- Two-step propose/accept ownership handoff for OptionsContract and Escrow, and two-step Escrow controller/payout-reconciler acceptance.

### Open limitations
1. **Monitoring is not production observability.** Durable telemetry sink, multi-instance aggregation, contract event/indexer ingestion, authoritative state reconciliation, alert delivery, dashboards, SLOs, runbooks, alert deduplication, and clock-skew policy remain.
2. **Storage estimate is not exact trie accounting.** Exact per-record storage delta (including trie/key/value overhead), aggregate reserve accounting, bounded overpayment policy, and gas/storage regression thresholds remain.
3. **No safe archival/refund lifecycle.** No pruning/archival or storage refund path exists. Any future process must preserve audit/legal evidence and never remove unsettled positions; storage stake is not automatically refundable.
4. **Admin handoff is not complete governance.** Pending-change cancellation/expiry/replacement, timelocks, multisig, role separation (owner/guardian/controller/treasury/reconciler), emergency recovery/break-glass policy, pending authority views, and admin audit alerts remain.
5. **Account keys are outside contract control.** NEAR access-key rotation/revocation and key-compromise procedures require account-level operations and a reviewed runbook; propose/accept contract methods do not rotate account keys.
6. **Deployment compatibility remains unproven.** Persistent-state migration and authority-transition review must precede upgrades to any already deployed account.

## Batch 4 — Phases 10–12: AI provider, UI/backend integration, adversarial testing

Batch 4 implementation is in progress on `work/batch-4-ai-integration-adversarial`, stacked on the unmerged Batch 3 PR branch. CI and independent review are pending.

### Implemented in the Batch 4 branch (pending CI)
- Provider-neutral SDK client for a Handel-controlled AI backend gateway, with HTTPS enforcement (localhost development exception), bearer authentication, bounded response size, request timeout, process-local sliding-window rate limiting, strict response envelope/proposal schema, configured model identity, stable error codes, and request/response SHA-256 provenance.
- Deterministic fallback when no backend key is configured; fallback makes no network request. Configured-provider errors fail closed rather than silently substituting a model result.
- Explicit proposal preparation/preview and a separate approval-gated connected-wallet signer callback. The SDK does not hold keys or sign server-side; signer is not called without affirmative approval.
- Hardened uint256 decimal-string policy parsing, bounded identifiers, permission-bound validation, and adversarial/boundary tests.

### Open limitations / external gates
1. **No live AI provider is configured.** No vendor, endpoint, model, backend secret manager, shared/distributed rate-limit store, budget/quota policy, durable audit sink, or production monitoring is provisioned. The SDK expects a Handel-controlled gateway; deployment and real provider contract tests remain. No live provider credentials are stored in the repository.
2. **No existing UI application is present in this repository tree.** Phase 11 currently supplies a typed SDK boundary only. Actual UI screens, wallet adapter, position queries/indexer, status subscriptions, recovery UX, and production API deployment remain external integration work and require the UI/backend repository.
3. **Adversarial coverage is partial.** Tests cover malformed/extra provider fields, oversized responses, model mismatch, rate limiting, approval gating, amount parsing and policy boundaries. Comprehensive property/fuzz coverage for malicious NEP-141 callback messages, all timestamp overflow paths, callback ordering, and partial/ambiguous settlement state machines remains.
4. **Independent security review remains outstanding.** Access control, callback handling, storage/migration, pause semantics, payout recovery, verifier trust, and key-management boundaries require independent review before real-asset use.

## Batch 5 — Phase 13: Testnet deployment and release readiness

Not completed. This is a gated deployment phase, not an implication of passing CI.

- Dedicated Testnet contract accounts, deployment and upgrade procedure, configuration, and verified account-key policy.
- Real Testnet token registration and NEP-145 storage funding for escrow and payout recipients.
- Supported-asset deposit and wallet-signed settlement, with independently inspected receipts, events, resulting contract state, and token balances.
- End-to-end premium, exercise, expiry, payout retry, ambiguous-outcome reconciliation, and duplicate/replay tests on deployed contracts.
- Independent verifier/RPC configuration and operational monitoring/alert delivery.
- Migration/redeployment decision for existing persistent state, documented rollback and recovery plan.
- Independent security review sign-off and explicit release approval.

## Cross-cutting limitations and rules

- **No mainnet or real-asset readiness claim** follows from CI or Sandbox tests.
- **No Testnet-deployed/Testnet-verified label** until actual deployment and real Testnet transactions have been independently inspected.
- **No automatic retry after ambiguous submission or payout.** Unknown outcomes must be reconciled with authoritative evidence first.
- **No wallet private keys or seed phrases** are handled by Handel SDK code.
- **No unsupported Ondo route** may be inferred from ticker similarity or a generic bridge adapter.
- **No destructive migration, archival, refund, or contract upgrade** should occur without an audited state/accounting plan and explicit release approval.
- Every limitation should have an owner, implementation/test evidence, and closure criterion before being marked resolved.

## Closure checklist

For each item, record:
- [ ] Code or infrastructure change landed.
- [ ] Unit/property tests added and passing.
- [ ] Sandbox/integration test passed where applicable.
- [ ] Testnet evidence captured where applicable.
- [ ] Security/review sign-off obtained where required.
- [ ] Documentation and operational runbook updated.
- [ ] Status changed here with commit/run/evidence references.
