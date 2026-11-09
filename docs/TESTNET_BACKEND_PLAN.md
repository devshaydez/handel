# Handel Testnet backend plan

## Agreed scope

- NEAR Testnet only; no mainnet, real-asset custody, or real-fund operation.
- Backend first; integrate the user's existing UI when supplied.
- Deterministic local AI proposal fallback now; provider adapter only when API access is available.
- Never request or commit wallet secrets or API credentials.

## Current implementation status

### OptionsContract and EscrowContract

- Persistent position records, idempotent registration, pinned token/escrow accounts, premium sidecar, asynchronous premium payout/refund, authenticated sequenced lifecycle outbox, replay protection, and evidence-attested ambiguous payout reconciliation are implemented in PR #2.
- Combined Sandbox coverage exercises Call/Put premium and exercise settlement, lifecycle synchronization, and replay of missing lifecycle events. Sandbox tokens are mocks, not live assets.
- Registration callback failure/retry and expiry callback failure/reconciliation now have dedicated fault-injection Sandbox coverage. Batch 1 CI run #42543351501 passed both contract/Sandbox and SDK jobs.
- Escrow exercise payout legs remain sequential and non-atomic. Ambiguous callbacks require the configured human evidence attestor; timeout alone is never grounds for retry.
- OptionsContract legacy Borsh root migration is not implemented. Do not upgrade a legacy deployment until exact V1 layouts and a separately reviewed migration or audited redeployment process are established.

### SDK

- NEP-413 payload builders create unsigned payloads only. The user's wallet must sign; this SDK never handles private keys.
- OperationJournal provides in-memory operation-ID idempotency, transaction/result correlation, explicit unknown-outcome handling, and retries only after definitive failure.
- Batch 2 adds a durable file snapshot store for Node backends, serialized journal writes with rollback on persistence failure, a wallet signing boundary, and a concrete NEAR Testnet JSON-RPC observer that waits for FINAL execution. A hosted database, wallet implementation, RPC quorum/indexer, and automatic transaction submission remain host responsibilities.
- Batch 2 adds a Tidepool 1Click-compatible Testnet adapter for dynamic token discovery, dry quotes, explicit opt-in before deposit-address creation, memo-aware deposit notification, and status polling. It rejects Handel's configured Ondo assets because Tidepool's published token registry does not list them.
- Batch 2 adds normalized settlement-receipt validation, a durable serialized evidence service, and replay protection persisted with accepted evidence. A host-supplied ReceiptInspector must independently fetch and decode canonical NEAR verifier receipts; the SDK validation module is not itself a light client or cryptographic proof implementation.
- LifecycleEventCursor enforces ordered sequence delivery, rejects gaps/conflicting replays, and treats exact event replays as idempotent. Persist its snapshot in the host application.

## Critical remaining blockers

1. Remaining Sandbox work: broader adversarial coverage for ambiguous lifecycle delivery and partial settlement; Batch 1's registration and expiry callback fault-injection tests passed.
2. Migration: exact legacy Borsh root layouts, versioned migration entrypoints or audited redeployment with explicit asset/position handling.
3. Independent verification: SDK evidence-binding validation and replay protection are implemented, but a production ReceiptInspector/verifier service with independent RPC quorum, finality/reorg handling, key management, durable audit logs, and alerting remains.
4. Real asset admission: Tidepool Testnet adapter and live token discovery are implemented. Tidepool publishes test USDC/USDT, wNEAR, wBTC, ETH, XAUT and bridged test assets; it does not list Handel's Ondo stock assets. Exact Ondo route support, custody, token mapping, decimals, NEP-145 deposits, and a supported collateral reservation mechanism remain unproven.
5. Settlement atomicity/compensation: escrow's two payout legs are sequential and non-atomic; specify and audit compensation/dispute handling for partial success.
6. Transaction infrastructure: durable journal adapter and wallet/transaction-observer interfaces are implemented. A concrete wallet selector/RPC/indexer service, event ingestion worker, monitoring/alerting, and recovery UI remain.
7. Security and operations: admin/key rotation, pause/unpause authority, storage economics/archival, adversarial/property testing, and independent security review.
8. Testnet release gate: deploy to NEAR Testnet and verify actual transactions, receipts, token balances, and final contract state. Never label Sandbox or offline results as Testnet verification.

## Validation labels

Report these separately: Implemented; Sandbox-tested; Testnet-deployed; Testnet-verified.
Never promote one label to another. Never commit secrets. Keep main untouched until the user explicitly approves a merge.
