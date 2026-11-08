# Backend gap register

Status snapshot: 2026-11-08, PR #2 head `1792d600cbfd54b10deab95f8f5f0ab082b4365d`.

The latest GitHub Actions run (#42508978797) passed Rust formatting, unit tests, optimized Wasm builds, isolated callback-failure Wasm build, Sandbox integration tests, SDK build/tests, and the offline lifecycle demo. The combined OptionsContract/Escrow Sandbox test now proves Call and Put registration, exact collateral deposits, exercise-payment deposits, sequential payout completion, final balances, and exclusion of the competing reconciliation rail. These are mock-token Sandbox results, not Testnet verification.

## P0 — Required before claiming a complete Testnet backend

1. **One authoritative position lifecycle.** OptionsContract persists an escrow ID after registration, but the combined test settles directly through Escrow. There is no authoritative cross-contract state synchronization for collateral locked, exercise payment received, partial payout, settled, expiry, or reconciliation-required. Define the state machine and make transitions receipt-driven. Never mark OptionsContract settled from a requested promise alone.
2. **Expiry path end to end.** The escrow has a writer-initiated expiry return after expiry plus the 24-hour exercise grace period, and isolated tests cover expiry payout retry. The combined OptionsContract/Escrow flow does not prove expiry release, expiry callback persistence, or final OptionsContract state.
3. **Registration failure/recovery integration.** Add combined tests for escrow registration rejection, failed callback receipt, and writer retry after an ambiguous registration callback. Idempotency protects against duplicate escrow records, but combined recovery behavior is not yet proven.
4. **Ambiguous payout callback recovery.** A payout transfer may succeed while its callback receipt fails. The contract intentionally leaves the position pending and blocks automatic retry. A safe, independently verifiable reconciliation procedure is still missing; do not unlock or resend based on timeout alone.
5. **Partial-settlement recovery.** Payment-to-writer and collateral-to-holder are sequential, separate NEP-141 transfers. Definitive failures are retryable, but a production policy for prolonged partial settlement, token pause/blacklist, unavailable recipient, and human-governed recovery/compensation is not implemented. Do not describe this as atomic.
6. **Choose and enforce a single settlement rail.** The OptionsContract external-reconciliation rail and Escrow rail are separate. The test proves a registered escrow position cannot start the competing collateral-lock rail, but the entire lifecycle, reconfiguration, retries, and terminal states must be guarded against double execution.
7. **Real asset and route compatibility.** Current combined tests use mock NEP-141 tokens. The configured Ondo identifiers represent BNB-chain assets; they are not automatically NEAR NEP-141 contracts. Tidepool's published test token set does not establish support for Handel's Ondo stock assets. A supported bridge/Intents route, token mapping, decimals, custody proof, and exact testnet asset registry are still required.

## P1 — Backend service and operational completeness

8. **Authenticated settlement verifier/reconciler.** The current OptionsContract trusts one configured reconciler account and validates receipt fields; it does not verify cryptographic verifier events, source-chain finality, or reorgs. Implement a service that verifies signed/on-chain evidence before submitting reconciliation, with replay protection and durable audit logs.
9. **Transaction orchestration and monitoring.** No complete production-grade worker is demonstrated for submitting calls, tracking NEAR receipts, polling escrow state, retrying only definitive failures, alerting on stuck pending states, and reconciling service state after restarts.
10. **Premium collection on the escrow rail.** The escrow flow handles writer collateral and holder exercise payment, but does not collect/settle the option premium when the position opens. The existing OptionsContract premium flow belongs to the external reconciliation rail. Define and test premium custody/payment for the escrow path or explicitly scope it out of that path.
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