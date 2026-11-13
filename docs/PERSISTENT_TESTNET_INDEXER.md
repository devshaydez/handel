# Testnet portfolio and activity data

## No-cost mode (default)

The frontend does not require a hosted database or a separate indexer service to read the current portfolio. When `VITE_HANDEL_INDEXER_URL` is unset or unavailable, it calls the public NEAR Testnet RPC directly:

- `get_position_count()` at finality `final`
- `get_positions_page(from_id, limit)` for pages of at most 50 positions, pinned to the same finalized block hash
- filters the returned public positions to the connected account as writer or holder

This path requires the read-only methods to be deployed to `options.shaydez.testnet`. The contract owner must authorise that Wasm upgrade. It does not require a database, paid hosting, or any asset transfer. No initializer or state reset is needed.

Activity in no-cost mode stores state observations in this browser's local storage. It records newly discovered positions and state changes when the user opens Activity. It cannot recover transitions that happened while the app was closed, does not sync across devices, and is not a complete transaction/receipt history. It must not be presented as a complete chain event index.

## Optional persistent indexer

The service below is an optional later upgrade for durable cross-device portfolio snapshots. It is not required for the no-cost frontend path.

This service indexes actual OptionPosition records from the deployed OptionsContract into PostgreSQL. It is separate from the browser store.

## Contract prerequisite

The indexer requires two read-only view methods added with this change: `get_position_count()` and `get_positions_page(from_id, limit)`. Pages are bounded to 50 and read at one pinned finalized block. No contract storage fields or existing position records are changed by these methods.

The updated Wasm must still be built, reviewed, and deployed to options.shaydez.testnet by its authorized owner before the optional server can start. Do not run an initializer or redeploy with state reset.

## Run the optional service

From `sdk/`:

```sh
npm install
npm run build
DATABASE_URL='postgres://…' \
HANDEL_OPTIONS_CONTRACT_ID='options.shaydez.testnet' \
NEAR_RPC_URL='https://rpc.testnet.near.org' \
npm run indexer
```

Optional settings: PORT (default 8788), HANDEL_INDEXER_POLL_MS (default 30000; minimum 5000).

The service creates its schema on startup and exposes GET /health, GET /v1/portfolio?account=writer.testnet, and GET /v1/activity?account=writer.testnet.

Portfolio results are on-chain position snapshots filtered by writer or holder. Activity records first discovery and observed on-chain position-state changes with finalized block identity. It does not claim a transaction hash or full wallet transaction history; that requires a separate finalized block/receipt event ingestor and transaction correlation.

## Reconciliation semantics

Every pass re-scans the full monotonic position-ID range. This discovers historical positions and detects state changes on positions indexed earlier. Upserts are idempotent, and database cursor progress is checkpointed. A page read is pinned to the same finalized block hash as the count; if the final head changes between reads, the pass fails closed and retries on the next interval.

## Production requirements for the optional service

- Use durable PostgreSQL with backups and a retention policy. Render Free Postgres expires after 30 days and has no backups; it is not suitable for persistent portfolio history.
- Keep DATABASE_URL only in the backend service's secret environment, never in Vite or browser variables.
- Restrict network ingress and configure CORS/authentication before exposing these endpoints publicly.
- Configure two independently operated NEAR RPC endpoints and compare finalized reads before treating this as production-grade. The current reader uses one endpoint and is an infrastructure trust assumption.
- The optional Activity output is a position-state journal, not a full transaction event history. Add a block/receipt log ingestor from the known contract deployment height before claiming complete Activity coverage.


## Finalized transaction and receipt history

The persistent indexer can additionally scan finalized NEAR blocks, their chunks, and transaction receipt outcomes. It stores transaction hashes, signer/receiver accounts, receipt IDs, receipt executors, finalized block identity, execution status, and raw receipt logs. Activity reads these records from `GET /v1/receipts?account=...` and displays them separately from the position-state journal.

Enable this scanner only after obtaining the exact finalized block height of the deployed OptionsContract deployment transaction. Do not estimate the height or use the current block. Configure:

```sh
HANDEL_RECEIPT_INDEXER_START_HEIGHT='<exact options deployment block height>'
HANDEL_RECEIPT_INDEXER_WATCH_ACCOUNTS='options.shaydez.testnet,escrow.shaydez.testnet,handel-agent.shaydez.testnet,wnear.tidepool-sandbox.testnet,usdc.tidepool-sandbox.testnet'
HANDEL_RECEIPT_INDEXER_POLL_MS='15000'
```

The scanner starts at that height and advances a durable database cursor only after a block has been processed. It filters chunk transactions by configured signer/receiver accounts, then retrieves each matching finalized transaction's complete receipt outcomes. Reprocessing a block is idempotent. The watch list should include the OptionsContract, Escrow, agent and token accounts; add any other accounts whose transactions must appear in Activity.

This is an RPC-backed historical index, not a consensus light client. It depends on an RPC provider retaining the requested historical blocks, chunks and transaction status. Use an archival-capable Testnet RPC for a long backfill and compare results against a second independent provider before relying on the history for settlement decisions. The current service uses one configured RPC for indexing; independent quorum verification remains a separate control.

If `HANDEL_RECEIPT_INDEXER_START_HEIGHT` is unset, the service leaves the receipt scanner disabled and `/v1/receipts` returns an explicit configuration error. It does not silently claim complete history. The exact deployment height is deliberately an operator-supplied value because guessing it could omit early transactions.

Receipt outcomes returned by current Testnet RPCs include a receipt `block_hash` but no `block_height`. When the height is absent the scanner resolves it by querying that block hash and fails closed if the block is unavailable or does not match. It never substitutes the enclosing transaction's height.

### Verified heights for the current Testnet deployment

| Deployment | Transaction | Finalized height |
|---|---|---|
| OptionsContract | `5VL24bzw5XHdFunUZoWFGJ6ZVaC8uoHLRvLgT8fSmZzz` | 277440947 |
| Escrow | `DrQ8m91nef1uzZ11aVcG5B7i8FvLCHqZMKryp496gqeR` | 277435463 |

The Escrow height is the earlier of the two, so use it as the start height when both contracts must be covered: `HANDEL_RECEIPT_INDEXER_START_HEIGHT='277435463'`.

### Local verification against PostgreSQL 16

A read-only run against a local PostgreSQL 16 container, `https://rpc.testnet.fastnear.com` and the height above indexed exactly one finalized transaction (`DrQ8m91nef1uzZ11aVcG5B7i8FvLCHqZMKryp496gqeR`) with two receipts at heights 277435463 and 277435464. `/v1/receipts` and `/v1/activity` returned those rows. Resetting the durable cursor to 277435463 and re-running left the row counts unchanged (1 transaction, 2 receipts), confirming `ON CONFLICT` idempotency, and the cursor advanced to 277435473. This verifies receipt persistence and replay; it is not evidence that the position snapshot path works, because the deployed OptionsContract still lacks `get_position_count()` and `/health` reports that gap.
