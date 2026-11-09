# Batch 2 — Asset integration, settlement verification, transaction orchestration

## Scope

This batch adds safe NEAR Testnet integration primitives. It does not authorize real funds, mainnet, or custody of Handel's Ondo assets.

## Phase 4 — Testnet asset integration

- Added `TidepoolClient` for Tidepool's 1Click-compatible API: live token discovery, health, dry quotes, deposit notification, and status polling.
- The client resolves asset IDs from the live `/v0/tokens` registry rather than assuming ticker equivalence. It enforces Tidepool's documented MEMO restrictions: Stellar/XRP require ORIGIN_CHAIN + MEMO; MEMO is limited to supported origin chains and cannot be combined with ANY_INPUT.
- Quote requests default to `dry: true`. Creating a deposit address requires the explicit `allowTestnetDepositAddress: true` opt-in.
- The adapter rejects Handel's configured Ondo identifiers. Tidepool's published Testnet registry does not list NVDAon, TSLAon, AAPLon, or SPYon.
- The adapter never signs or submits wallet transfers. Testnet deposit addresses are custodial; never send real assets.

## Phase 5 — Settlement verification

- Added normalized receipt evidence binding operation ID, position ID, operation kind, canonical asset ID, raw amount, sender, receiver, transaction hash, receipt ID, and event index.
- Verification rejects failed/unknown execution, non-canonical or non-finalized receipts, mismatched event bindings, and replayed events.
- Added durable evidence persistence with serialized acceptance and atomic evidence/replay-key snapshots.
- Added `NearRpcReceiptInspector`: it queries NEAR JSON-RPC at `FINAL`, selects exactly one requested receipt, checks the receipt executor against the configured verifier account, validates receipt block identity, and decodes strict `EVENT_JSON` records using the `handel.settlement.v1` schema. Missing, malformed, wrong-executor, or failed evidence is rejected.
- The verifier must actually emit the documented settlement event. The current OptionsContract and published Tidepool adapter do not emit a Handel-specific settlement event; therefore the inspector is an executable integration boundary, not proof that a live Tidepool settlement can already be decoded.
- A single RPC endpoint remains an infrastructure trust assumption. Production needs independently operated RPC endpoints or a quorum, plus a documented reorg/finality policy. This is not a light client or cryptographic proof.

## Phase 6 — Transaction orchestration

- Added a Node file-backed JSON snapshot store with mode-0600 temporary writes and atomic rename, plus a generic host-supplied snapshot-store interface.
- Writes are serialized; failed persistence rolls back the in-memory transition.
- Added a crash-safe wallet operation runner. It persists a `submitting` marker before network submission, records definitive FINAL outcomes, and quarantines submit timeouts or crash-recovered in-flight submissions as unknown without resubmitting.
- Wallet signing remains inside the connected wallet; Handel never handles private keys.
- The file store is single-process only. A multi-instance deployment must provide a transactional database-backed `JsonSnapshotStore`; no database, credentials, or hosted worker are provisioned by this repository.
- Unknown transaction outcomes remain unknown and cannot be retried. Retry requires a recorded definitive failure and a fresh operation ID.

## Validation and release boundary

- Unit tests cover Tidepool token discovery, quote safety, unsupported Ondo assets, provider-status classification, MEMO routes, durable restart/recovery, pre-submit crash quarantine, ambiguous submission, wallet rejection, failed persistence, concurrent writes, receipt binding, finality, wrong receipt executor, malformed event logs, and replay protection.
- No live Tidepool deposit, wallet-signed Testnet transaction, Testnet contract deployment, Ondo settlement, or production RPC quorum has been performed.
- Batch 2 CI run #274 passed SDK build/tests and Rust format, optimized Wasm builds, and Sandbox integration tests on commit `7cb4828`. The new receipt-inspector changes require the next full CI run after the integrated batch is complete.

## Remaining external release gates

1. Deploy/configure a verifier or settlement adapter that emits the exact `handel.settlement.v1` event from the canonical receipt.
2. Run an end-to-end Testnet deposit and wallet-signed settlement using supported Tidepool test assets.
3. Configure a multi-instance transactional database store, worker process, and independent RPC quorum.
4. Add an Ondo-compatible route only after exact token identifiers, decimals, and verifier support are demonstrated.
5. Complete independent security review before any real-asset use.

These are external integration/deployment gates, not claims of completed live settlement.
