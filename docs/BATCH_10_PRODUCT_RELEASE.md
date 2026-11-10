# Batch 10 — Product integration and release evidence (Phases 20–22)

**Branch:** work/batch-10-product-release  
**Frontend scope:** intentionally excluded. The user is implementing the frontend manually. Do not add UI frameworks, pages, styles, or frontend build configuration.

## Phase 20 — stable frontend-facing SDK contract

Added sdk/src/frontend-contract.ts. It defines position, operation, proposal, policy and portfolio DTOs; host adapter methods for reads; wallet-backed actions for offer creation, policy changes, mode changes, revocation, proposal creation/approval/rejection, exercise and expiry release; and finality states for success, failure and unknown.

All u64/u128 values remain canonical decimal strings. The SDK validates NEAR account IDs, integer bounds, positive amounts, allowlists and adapter signer identity. A transaction hash is explicitly a submitted transaction, not proof of final execution. Settlement evidence remains a separate field from contract lifecycle state.

The adapter is a contract, not a deployed service or completed RPC/indexer integration. The frontend must supply connected-wallet and trusted read adapters. Paginated indexer data must set complete=false until all pages are fetched. Display source and block height.

## Phase 21 — adversarial integration tests

Added offline tests for account-bound portfolio reads, cross-account response rejection, u128/u64 boundaries, unsafe JS numbers, zero amounts, duplicate allowlists, signer mismatch, submitted-versus-final separation and transaction-bound finality.

These tests do not replace browser wallet round-trip, deployed Testnet contract testing, independent verifier receipt checks or live Ondo route verification.

## Phase 22 — reproducible manual frontend release gates

1. Build the SDK and run its full unit suite.
2. Connect a Testnet wallet; account changes must invalidate stale account-scoped UI state.
3. Read policy and portfolio at a recorded final block; show source, block height and pagination completeness.
4. Create an offer with synthetic test assets only; keep UI state as submitted until finality.
5. Exercise approval, rejection, revocation and policy expiry paths.
6. Force an RPC timeout after submission; preserve unknown and do not automatically resubmit.
7. Verify settlement only when a finalized verifier receipt matches operation, position, asset, amount, sender and receiver.
8. Record exact commit, CI run, network, contract IDs, token IDs and artifact hashes for a demo.

## Explicit non-goals and blockers

No frontend source, framework, pages, CSS, wallet UI or visual design is created here. No production indexer, backend API server, authentication/session service or database is deployed by this SDK contract. No live Ondo route, custody proof or production settlement is inferred from Tidepool Testnet dry quotes. Tidepool assets are synthetic, not Ondo tokenized stocks. Escrow payouts remain sequential/non-atomic and the configured reconciler remains a trust assumption pending independent review. No Testnet deployment, account provisioning, signing, funding or asset movement is authorized or claimed. Mainnet and real-asset use remain blocked pending independent security review and end-to-end evidence.
