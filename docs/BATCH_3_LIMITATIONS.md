# Batch 3 limitations register

> This file is the Phase 7–9 detail only. The authoritative project-wide list, including Batch 1 and Batch 2 carry-forward items, is [ALL_BATCH_LIMITATIONS.md](./ALL_BATCH_LIMITATIONS.md).

Status: 2026-11-09. Carry these items forward; do not close an item until code, tests, and required external evidence exist.

## Phase 7 — Monitoring and observability

Implemented in code:
- SDK status counters for operation and position states.
- Configurable warning/critical age thresholds for in-flight, unknown, pending-payout, and reconciliation-required states.
- Bounded in-memory event retention and normalized identifiers/messages.

Still open:
- Durable production telemetry sink and multi-instance aggregation.
- Contract event/indexer ingestion and authoritative state reconciliation.
- Alert delivery (email/webhook/on-call), dashboard, SLOs, and runbooks.
- Clock-skew handling across hosts and alert deduplication/suppression.
- Monitoring tests against actual Sandbox stuck callbacks and restart/recovery scenarios.
- No secrets or raw signed payloads may enter telemetry.

## Phase 8 — Storage economics and optimization

Implemented in code:
- Escrow view reports serialized-position byte estimate, current NEAR storage byte price, attached reserve, and estimated surplus.
- Estimate explicitly reports estimate-only and refund-unavailable flags.

Still open:
- Exact trie storage delta attribution per position and sidecar, including key/value overhead.
- Aggregate reserve accounting and bounded reserve/overpayment policy.
- Audited archival/pruning that preserves legal/audit evidence and never removes unsettled positions.
- Safe refund path after proving storage is no longer required; NEAR storage stake is not automatically withdrawable.
- NEP-145 token-account storage registration/funding and payout-recipient storage failures.
- Gas/storage regression thresholds in CI; current benchmark is informational.
- Existing deployment root-state migration remains a hard gate; no migration was implemented in this batch.

## Phase 9 — Administrative controls and key security

Implemented in code:
- OptionsContract ownership uses propose/accept; old owner remains authoritative until the proposed account accepts.
- Escrow ownership uses propose/accept.
- Escrow controller and payout reconciler changes use propose/accept by the proposed account.

Still open:
- Pending-change cancellation, expiry, and replacement semantics.
- Timelock and multisig governance for high-impact administration.
- Explicit separation of owner, pause guardian, controller, treasury, and reconciler roles.
- Safe emergency pause/unpause and break-glass recovery policy.
- NEAR account access-key rotation/revocation and key-compromise runbook. Contract methods do not rotate account keys.
- Pending authority change views for controller and payout reconciler.
- Admin change audit events and monitoring alerts.
- Independent review of authority transitions and upgrade/deployment process.

## Cross-phase release gates

- No Testnet deployment or Testnet-verified operation is implied by SDK/Rust CI.
- No live Ondo asset route is established.
- No production verifier/RPC quorum, light client, or independent external-chain proof is implemented.
- No full legacy-state migration is implemented or approved.
- No production readiness claim until these limitations are closed and independently reviewed.
