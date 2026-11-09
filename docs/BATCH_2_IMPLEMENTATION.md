# Batch 2 — Asset integration, settlement verification, transaction orchestration

## Scope

This batch adds safe NEAR Testnet integration primitives. It does not authorize real funds, mainnet, or custody of Handel's Ondo assets.

## Phase 4 — Testnet asset integration

- Added `TidepoolClient` for Tidepool's 1Click-compatible API: live token discovery, health, dry quotes, deposit notification, and status polling.
- The client resolves asset IDs from the live `/v0/tokens` registry rather than assuming ticker equivalence.
- Quote requests default to `dry: true`. Creating a deposit address requires the explicit `allowTestnetDepositAddress: true` opt-in.
- The adapter rejects Handel's configured Ondo identifiers. Tidepool is community-operated and its published testnet token registry does not list NVDAon, TSLAon, AAPLon, or SPYon.
- The adapter never signs or submits wallet transfers. Testnet deposit addresses are custodial; never send real assets.

## Phase 5 — Settlement verification boundary

- Added normalized receipt evidence types binding operation ID, position ID, operation kind, canonical asset ID, raw amount, sender, receiver, transaction hash, receipt ID, and event index.
- Verification rejects failed/unknown execution, non-canonical or non-finalized receipts, and mismatched event bindings.
- Added persisted replay-key snapshot support.
- The host must implement `ReceiptInspector` using independently queried NEAR RPC/indexer infrastructure and a defined finality/reorg policy. The SDK is a validation layer, not a light client or cryptographic proof system.
- Tidepool's `SUCCESS` is classified as provider-reported success only. It is not accepted as proof of Handel contract settlement.

## Phase 6 — Transaction orchestration

- Added a Node file-backed JSON snapshot store with mode-0600 temporary writes and atomic rename, plus a generic host-supplied snapshot-store interface.
- Writes are serialized; a failed persistence operation rolls back the in-memory transition.
- Added wallet NEP-413 signing boundary and a concrete NEAR JSON-RPC observer that requests `wait_until: FINAL`; unknown RPC/network outcomes remain unknown. The connected wallet signs; Handel never handles private keys.
- Unknown transaction outcomes remain unknown and cannot be retried. Retry requires a recorded definitive failure and a fresh operation ID.
- Wallet-selector integration, RPC quorum/indexer, verifier-event decoder, worker process, monitoring, and recovery UI remain deployment work.

## Validation and release boundary

- Unit tests cover dynamic token discovery, quote safety, unsupported Ondo assets, provider-status classification, durable restart/recovery, failed persistence, concurrent writes, receipt binding, finality, and replay protection.
- CI status is recorded in the Batch 2 pull request after the full run completes.
- This is SDK/Testnet adapter implementation only. No Tidepool deposit, NEAR Testnet contract deployment, real Ondo transfer, or production verifier has been performed.

## External integration references

- Tidepool quickstart: https://www.usetidepool.tech/docs/quickstart
- Tidepool API reference: https://www.usetidepool.tech/docs/api-reference
- Tidepool live Testnet token registry: https://www.usetidepool.tech/v0/tokens
- Tidepool trust model and verifier flow: https://www.usetidepool.tech/docs/concepts/how-it-works
- NEAR JSON-RPC transaction `tx` finality semantics: https://docs.fastnear.com/rpc
