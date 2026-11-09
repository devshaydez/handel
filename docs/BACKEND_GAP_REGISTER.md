# Backend gap register

Status snapshot: 2026-11-09, after Batch 1 merge and Batch 2 implementation start.

Runtime and test commit `f5e8460b3ac7cdf05328801da2743a7ab5686a74` passed CI run #42531159905 (run 260). Rust formatting, contract/unit tests, optimized Wasm builds, isolated callback-failure Wasm, and the combined Sandbox premium/exercise/lifecycle-resend flow passed. The TypeScript SDK build, unit tests, and offline lifecycle demo also passed. The Sandbox assets are mocks, not live tokens.

## P0 — Required before claiming a complete Testnet backend

1. **One authoritative position lifecycle.** A sequenced Escrow outbox now emits custody, payout, premium, expiry, and reconciliation transitions. OptionsContract authenticates the pinned escrow, verifies both IDs, and enforces sequence/digest replay protection. Permissionless resend replays only the stored event and never transfers tokens. The combined Sandbox test verifies premium-to-Open and exercise-to-Settled state parity and explicitly resends missing event sequences. Callback-failure injection and the full expiry lifecycle remain open.
2. **Expiry path end to end.** The escrow writer-initiated expiry return and definitive payout retry are unit-tested. OptionsContract's authenticated Expired-event mapping is also unit-tested. The combined Sandbox flow does not yet prove expiry release, callback persistence, or final OptionsContract state.
3. **Registration failure/recovery integration.** OptionsContract unit tests now simulate a failed registration callback, verify pending state clears, and verify writer retry followed by successful callback persistence. Escrow unit tests cover idempotent duplicate registration. Combined Sandbox failure injection and cross-contract recovery remain unproven.
4. **Ambiguous payout callback recovery.** Escrow now supports an owner-configured reconciler that records an attestation bound to position, leg, token, amount, sender, receiver, evidence hash/reference, reconciler, and timestamp. It can resolve only a currently pending ambiguous leg; successful exercise-payment attestation advances to collateral delivery without repeating payment. This is a human-governed trust root, not an on-chain proof. The verifier service and adversarial Sandbox coverage remain open. Never retry on timeout alone.
5. **Partial-settlement recovery.** Payment-to-writer and collateral-to-holder remain sequential, non-atomic transfers. Definitive failures retry only the failed leg. Ambiguous outcomes can be resolved only by the configured evidence attestor and are durably audited; unresolved evidence leaves funds frozen. Token pause/blacklist, unavailable-recipient policy, compensation, and monitoring remain open.
6. **Choose and enforce a single settlement rail.** The OptionsContract external-reconciliation rail and Escrow rail are separate. The test proves a registered escrow position cannot start the competing collateral-lock rail, but the entire lifecycle, reconfiguration, retries, and terminal states must be guarded against double execution.
7. **Real asset and route compatibility.** Batch 2 adds a Tidepool Testnet API adapter with live token discovery and explicit dry-quote / deposit-address safety controls. Its published token registry has test USDC, USDT, wNEAR, wBTC, ETH, XAUT and selected bridged test assets; it does not establish support for Handel's Ondo stock assets. Ondo remains blocked pending a supported route, token mapping, decimals, custody proof, and enforceable per-position reservation.

## Batch 2 implementation status (in progress)\n\n- Phase 4: Tidepool Testnet adapter and live token registry discovery added; no live deposit or Ondo support claim.\n- Phase 5: settlement receipt binding/finality/replay validation added behind an independently supplied receipt inspector; no in-house RPC quorum or light client yet.\n- Phase 6: durable journal storage interface, serialized persistence, wallet signing boundary, and transaction observer interface added; concrete hosted worker/indexer remains.\n- Validation is pending the Batch 2 CI run.\n\n## P1 — Backend service and operational completeness

8. **Authenticated settlement verifier/reconciler.** SDK now validates normalized verifier receipt bindings and replay keys. The host must still supply an independent ReceiptInspector. OptionsContract retains its configured external-rail reconciler; Escrow has a separate owner-configured evidence attestor. Neither contract nor the SDK adapter independently verifies remote signatures, source-chain finality, or reorgs. Build the verifier service with independent RPC inspection, replay protection, durable audit logs, key rotation, and alerting.
9. **Transaction orchestration and monitoring.** Batch 2 adds a durable operation-journal adapter, wallet signing boundary, and transaction-observer interface. A production-grade worker is still required for concrete wallet/RPC integration, receipt polling, escrow-state indexing, definitive-failure-only retries, alerts, and recovery after restarts.
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