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
- Registration retry and expiry mapping/release have unit coverage; combined cross-contract fault-injection and full expiry callback persistence remain unproven.
- Escrow exercise payout legs remain sequential and non-atomic. Ambiguous callbacks require the configured human evidence attestor; timeout alone is never grounds for retry.
- OptionsContract legacy Borsh root migration is not implemented. Do not upgrade a legacy deployment until exact V1 layouts and a separately reviewed migration or audited redeployment process are established.

### SDK

- NEP-413 payload builders create unsigned payloads only. The user's wallet must sign; this SDK never handles private keys.
- OperationJournal provides in-memory operation-ID idempotency, transaction/result correlation, explicit unknown-outcome handling, and retries only after definitive failure. The host application must persist snapshots; this is not a durable backend service.
- LifecycleEventCursor enforces ordered sequence delivery, rejects gaps/conflicting replays, and treats exact event replays as idempotent. Persist its snapshot in the host application.
- These are orchestration primitives, not a transaction submitter, indexer, verifier, or proof of settlement.

## Critical remaining blockers

1. Combined failure-path Sandbox tests: registration callback receipt failure/recovery, expiry release with callback persistence, and ambiguous lifecycle delivery under fault injection.
2. Migration: exact legacy Borsh root layouts, versioned migration entrypoints or audited redeployment with explicit asset/position handling.
3. Independent verification: verifier service for evidence inspection, finality/reorg handling, and independently verifiable external events. The on-chain evidence attestor is a human trust root.
4. Real asset admission: verify exact token contracts, canonical asset IDs, decimals, supported routes, NEP-145 storage deposits and recipient registration. Existing mock tests do not establish Ondo support.
5. Settlement atomicity/compensation: escrow's two payout legs are sequential and non-atomic; specify and audit compensation/dispute handling for partial success.
6. Transaction infrastructure: wallet/RPC adapter, durable operation storage, event indexer, monitoring/alerting, and recovery UI are not implemented.
7. Security and operations: admin/key rotation, pause/unpause authority, storage economics/archival, adversarial/property testing, and independent security review.
8. Testnet release gate: deploy to NEAR Testnet and verify actual transactions, receipts, token balances, and final contract state. Never label Sandbox or offline results as Testnet verification.

## Validation labels

Report these separately: Implemented; Sandbox-tested; Testnet-deployed; Testnet-verified.
Never promote one label to another. Never commit secrets. Keep main untouched until the user explicitly approves a merge.
