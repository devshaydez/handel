# Persistent Testnet position indexer

This service indexes actual OptionPosition records from the deployed OptionsContract into PostgreSQL. It is separate from the browser store.

## Contract prerequisite

The indexer requires two read-only view methods added with this change: get_position_count() and get_positions_page(from_id, limit). Pages are bounded to 50 and read at one pinned finalized block. No contract storage fields or existing position records are changed by these methods.

The updated Wasm must still be built, reviewed, and deployed to options.shaydez.testnet by its authorized owner before the indexer can start. Do not run an initializer or redeploy with state reset.

## Run

From sdk/:

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

Portfolio results are on-chain position snapshots filtered by writer or holder. Activity currently records first discovery and observed on-chain position-state changes with finalized block identity. It does not yet claim a transaction hash or full wallet transaction history; that requires a separate finalized block/receipt event ingestor and transaction correlation. Never display these snapshot records as signed transaction records.

## Reconciliation semantics

Every pass re-scans the full monotonic position-ID range. This discovers historical positions and detects state changes on positions indexed earlier. Upserts are idempotent, and database cursor progress is checkpointed. A page read is pinned to the same finalized block hash as the count; if the final head changes between reads, the pass fails closed and retries on the next interval.

## Production requirements

- Use durable PostgreSQL with backups and a retention policy. Render Free Postgres expires after 30 days and has no backups; it is not suitable for persistent portfolio history.
- Keep DATABASE_URL only in the backend service's secret environment, never in Vite or browser variables.
- Restrict network ingress and configure CORS/authentication before exposing these endpoints publicly.
- Configure two independently operated NEAR RPC endpoints and compare finalized reads before treating this as production-grade. The current reader uses one endpoint and is an infrastructure trust assumption.
- The current Activity output is a position-state journal, not a full transaction event history. Add a block/receipt log ingestor from the known contract deployment height before claiming complete Activity coverage.