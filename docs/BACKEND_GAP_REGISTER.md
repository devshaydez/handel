# Backend gap register

Status snapshot: 2026-11-08, PR #2 head `9b73d10f819e322221f0f3b05e478c3273bf7831`.

Batch 1 runtime changes passed CI run #42529923092 (run 249) on commit `1c0871bef8eeecf3c2fa0fe7abd6ca21f1a1685a`. Rust formatting, unit tests, optimized contract Wasm, isolated callback-failure Wasm, and the combined Sandbox integration test passed. The TypeScript SDK build, SDK unit tests, and offline lifecycle demo also passed. The Sandbox flow verifies Call and Put premium custody/payout, OptionsContract Open/Settled synchronization, and replay of missing ordered lifecycle events. All token tests use mocks, not live assets.

## P0 — Required before claiming a complete Testnet backend

1. **One authoritative position lifecycle.** A sequenced Escrow outbox now emits custody, payout, premium, expiry, and reconciliation transitions. OptionsContract authenticates the pinned escrow, verifies both IDs, and enforces sequence/digest replay protection. Permissionless resend replays only the stored event and never transfers tokens. The combined Sandbox test verifies premium-to-Open and exercise-to-Settled state parity and explicitly resends missing event sequences. Callback-failure injection and the full expiry lifecycle remain open.
2. **Expiry path end to end.** The escrow has a writer-initiated expiry return after expiry plus the 24-hour exercise grace period, and isolated tests cover expiry payout retry. The combined OptionsContract/Escrow flow does not prove expiry release, expiry callback persistence, or final OptionsContract state.
3. **Registration failure/recovery integration.** Add combined tests for escrow registration rejection, failed callback receipt, and writer retry after an ambiguous registration callback. Idempotency protects against duplicate escrow records, but combined recovery behavior is not yet proven.
4. **Ambiguous payout callback recovery.** Escrow now supports an owner-configured reconciler that records an attestation bound to position, leg, token, amount, sender, receiver, evidence hash/reference, reconciler, and timestamp. It can resolve only a currently pending ambiguous leg; successful exercise-payment attestation advances to collateral delivery without repeating payment. This is a human-governed trust root, not an on-chain proof. The verifier service and adversarial Sandbox coverage remain open. Never retry on timeout alone.
5. **Partial-settlement recovery.** Payment-to-writer and collateral-to-holder remain sequential, non-atomic transfers. Definitive failures retry only the failed leg. Ambiguous outcomes can be resolved only by the configured evidence attestor and are durably audited; unresolved evidence leaves funds frozen. Token pause/blacklist, unavailable-recipient policy, compensation, and monitoring remain open.
6. **Choose and enforce a single settlement rail.** The OptionsContract external-reconciliation rail and Escrow rail are separate. The test proves a registered escrow position cannot start the competing collateral-lock rail, but the entire lifecycle, reconfiguration, retries, and terminal states must be guarded against double execution.
7. **Real asset and route compatibility.** Current combined tests use mock NEP-141 tokens. The configured Ondo identifiers represent BNB-chain assets; they are not automatically NEAR NEP-141 contracts. Tidepool's published test token set does not establish support for Handel's Ondo stock assets. A supported bridge/Intents route, token mapping, decimals, custody proof, and exact testnet asset registry are still required.

## P1 — Backend service and operational completeness

8. **Authenticated settlement verifier/reconciler.** OptionsContract retains its configured external-rail reconciler. Escrow now has a separate owner-configured evidence attestor for ambiguous NEP-141 callbacks and durable evidence records. Neither contract verifies external signatures, source-chain finality, or reorgs. Build the verifier service with independent receipt inspection, replay protection, durable audit logs, key rotation, and alerting.
9. **Transaction orchestration and monitoring.** No complete production-grade worker is demonstrated for submitting calls, tracking NEAR receipts, polling escrow state, retrying only definitive failures, alerting on stuck pending states, and reconciling service state after restarts.
10. **Premium collection on the escrow rail.** Implemented in code: V2 registration pins USDC premium token/amount in a versioned sidecar; `ft_on_transfer` accepts only the exact holder/token/amount while collateral is locked; payout to writer is asynchronous; OptionsContract becomes Open only on authenticated `PremiumPaid`; exercise payment is rejected until premium payout is confirmed. Definitive failure can be retried; unpaid premium can be refunded after the grace period. Current-head CI and combined Sandbox Call/Put premium tests passed with mock USDC. Live asset/route compatibility and premium callback-failure injection remain release gates.
11. **NEP-145 storage lifecycle.** Sandbox tests pre-register mock token accounts. Production setup needs explicit token-account registration/storage funding for escrow and payout recipients, plus handling of insufficient storage and token transfer failures.
12. **Storage economics.** Escrow retains the full attached storage deposit, including extra deposits on idempotent registration retries, and has no archival/refund path. Add measured storage accounting, bounded reserve policy, and a reviewed refund/archival lifecycle. Review persistent OptionsContract storage layout and migration before any existing deployment.
13. **Admin/key operations.** Document and test ownership transfer, controller changes, reconciler rotation, pause/unpause authority, recovery access, and key compromise procedures. Consider whether controller configuration should become immutable or tightly governed once live positions exist.
14. **AI proposal provider.** SDK validation and deterministic local fallback work offline. A live provider adapter, request authentication, timeout/rate-limit behavior, provenance, and provider-failure handling are not demonstrated. Contract policy must remain authoritative.
15. **UI integration contract.** The user's existing UI is not yet integrated. Define typed API/SDK calls, wallet signing, transaction status, position queries, and error/recovery presentation when that UI is supplied.

## P2 — Hardening and release gates

16. Add property/fuzz tests for amount bounds, timestamp overflow, duplicate IDs, replay, state transition invariants, and adversarial NEP-141 callback messages.
17. Add gas/storage regression thresholds to CI; the current storage benchmark reports gas but is not a release threshold.
18. Add Testnet deployment smoke tests with dedicated contract accounts, token registration, real Testnet transactions, and independently inspected resulting state/balances.
19. Complete an independent security review of access control, callback handling, storage/migration, pause semantics, and non-atomic payout recovery.
20. Add monitoring/runbooks for stuck `PaymentPayoutPending`, `CollateralPayoutPending`, `ExpiryPayoutPending`, and `ReconciliationRequired` positions.

## Release labels

- **Implemented:** code exists.
- **Sandbox-tested:** the relevant Sandbox test passed.
- **Testnet-deployed:** contracts were deployed to NEAR Testnet.
- **Testnet-verified:** real Testnet transactions and resulting state/balances were inspected.

Do not promote one label to another. No Testnet deployment, live Ondo settlement, or production readiness is established by the current CI run. Keep `main` untouched until the user explicitly approves a merge.