# Evidence ledger

**Snapshot:** 2026-11-13  
**Repository:** [devshaydez/handel](https://github.com/devshaydez/handel)  
**Rule:** each row states exactly what the artifact proves and what it does not prove. A successful build, deployment or dry quote is never promoted into evidence of a complete trade.

## E-001 — Latest main CI

| Field | Value |
|---|---|
| Workflow | [Handel backend checks, run #43523462966](https://github.com/devshaydez/handel/actions/runs/43523462966) |
| Commit | `1e85e61` (merge of PR [#36](https://github.com/devshaydez/handel/pull/36)) |
| Date | 2026-11-13 22:57Z |
| Result | All 7 jobs succeeded, including frontend typecheck/build. |

Successful jobs:
- Rust format, unit tests and Wasm build
- TypeScript SDK build and offline demo
- Frontend typecheck and production build
- Live Testnet asset verification (read-only)
- Windows PowerShell proof-runner syntax
- NEAR AI credential and model-catalogue preflight
- Live NEAR AI → SDK → Sandbox contract proof

The separate [Dual-RPC Testnet state audit run #43523462747](https://github.com/devshaydez/handel/actions/runs/43523462747) was inspected at the same commit: it failed with exit code 2 because the three expected view methods are absent from the deployed Wasm (see E-009), not because of an RPC or script error.

**Proves:** the named jobs passed on the recorded commit and the audit fails only for the documented deployed-code gap.  
**Does not prove:** a real Testnet trade, Ondo asset support, Mainnet settlement, production custody or security audit.

## E-002 — OptionsContract Testnet deployment and exact Wasm match

| Field | Value |
|---|---|
| Account | `options.shaydez.testnet` |
| Deployment transaction | [5VL24bzw5XHdFunUZoWFGJ6ZVaC8uoHLRvLgT8fSmZzz](https://explorer.testnet.near.org/transactions/5VL24bzw5XHdFunUZoWFGJ6ZVaC8uoHLRvLgT8fSmZzz) |
| Artifact | `target/near/handel/_options.wasm` |
| Size | 425,264 bytes |
| SHA-256 | `1d95e9b75d94c13eea83e708502aff0a4c54c7eee4bb09881482403bb9479ab3` |
| Verification | User-run Testnet RPC `view_code` retrieval; local SHA-256 compared to expected artifact hash; exact match reported |

**Proves:** the Wasm code retrieved from `options.shaydez.testnet` matched the recorded local artifact byte-for-byte at verification time.  
**Does not prove:** the contract is initialized correctly, agent policy is enabled, Escrow state is compatible, an agent trade has executed, or any Ondo asset is supported.

## E-003 — Escrow Testnet deployment

| Field | Value |
|---|---|
| Account | `escrow.shaydez.testnet` |
| Deployment transaction | [DrQ8m91nef1uzZ11aVcG5B7i8FvLCHqZMKryp496gqeR](https://explorer.testnet.near.org/transactions/DrQ8m91nef1uzZ11aVcG5B7i8FvLCHqZMKryp496gqeR) |
| Recorded artifact SHA-256 | `a7d7f1184d813a94c5d1c431ebef01489720e906b4a6d4cf89b957d7245ab604` |
| Result | Deploy-only transaction; initialization omitted |

**Proves:** the Escrow Wasm deployment transaction was submitted successfully according to the deployment record.  
**Does not prove:** the deployed Escrow code hash was independently re-read and matched, the controller/asset configuration is correct, or a real deposit/payout occurred.

## E-004 — Tidepool Testnet read-only checks

| Artifact | Link / source | What it proves |
|---|---|---|
| Asset verifier | [CI run #43425939138](https://github.com/devshaydez/handel/actions/runs/43425939138) | The configured Tidepool Testnet asset and verifier checks passed against the test environment. |
| Dry quote | Same CI run | A dry quote request completed. It did not create a deposit address or submit a transaction. |
| Token snapshot | [evidence/tidepool-health.json](../evidence/tidepool-health.json) | Captured Tidepool health/token metadata at the recorded time; a snapshot is not a perpetual availability guarantee. |

**Does not prove:** Ondo stock-token availability, a committed quote, solver fill, token transfer, collateral reservation or settlement.

## E-005 — Offline lifecycle and Sandbox

| Artifact | Link | What it proves |
|---|---|---|
| Offline SDK lifecycle | [sdk/src/lifecycle-demo.ts](../sdk/src/lifecycle-demo.ts) | Deterministic fallback proposal, local policy validation and illustrative payload construction. |
| Integrated proof | [scripts/run-e2e-proof-demo.sh](../scripts/run-e2e-proof-demo.sh) and [PowerShell runner](../scripts/run-e2e-proof-demo.ps1) | Runs NEAR AI/System One smoke, SDK preparation and local Sandbox contracts with mock NEP-141 assets. |
| Sandbox tests | [contracts/escrow/tests/options_registration.rs](../contracts/escrow/tests/options_registration.rs) | Call/Put registration, mock-token deposits, payout/callback and failure-path assertions described by the test suite. |

**Proves:** local deterministic and Sandbox behavior for the covered scenarios.  
**Does not prove:** real Testnet wallet signing, Testnet token movement, Ondo/Intents settlement or production custody.

## E-006 — Delegated agent implementation

| Artifact | Link | What it proves |
|---|---|---|
| Contract | [src/lib.rs](../src/lib.rs) | Delegated entrypoints and contract-side policy checks are present in source. |
| SDK executor | [sdk/src/agent-execution.ts](../sdk/src/agent-execution.ts) | Reads policy/mode at finalized state, verifies restricted signer authority, creates Call/Put and registers Escrow with policy recheck. |
| Restricted signer | [sdk/src/near-function-call-signer.ts](../sdk/src/near-function-call-signer.ts) | Checks FunctionCall key receiver, method scope and bounded allowance; refuses FullAccess authority. |
| Frontend composer | [frontend/src/components/TestnetProposalComposer.tsx](../frontend/src/components/TestnetProposalComposer.tsx) | UI requests principal authorization, invokes delegated trade creation and separately requests principal collateral and holder premium signatures. |
| API | [api/v1/delegated/trades.js](../api/v1/delegated/trades.js) | Delegated route keeps the bearer token on the server side. |

**Proves:** the implementation path and automated tests exist.  
**Does not prove:** a real user-authorized Testnet trade or a completed two-party funding lifecycle. No complete live lifecycle transaction set is recorded here.

## E-007 — Production deployment state

`https://handel-live.vercel.app/` returned HTTP 200 with `last-modified: Fri, 13 Nov 2026 22:58:49 GMT`, one minute after the `main` push at 22:57:51Z. A fresh local `npm run build` of `main` at `1e85e61` emitted exactly the same bundle fingerprints that the live site serves:

- `assets/index-4M471nLL.js`
- `assets/index-idfmJuQN.js`
- `assets/index-BlQFy-dE.css`

No Vercel CLI, token or API credential is available in this environment, so the deployment ID and its commit SHA could not be read directly.

**Proves:** the production alias serves a bundle byte-identical (by content hash) to a fresh build of `main` at `1e85e61`, and the alias was regenerated immediately after the merge.  
**Does not prove:** the exact deployment record or commit SHA, because that requires authenticated Vercel access.

## E-008 — Trust and settlement boundary

See [THREAT_MODEL.md](THREAT_MODEL.md), [CUSTODY_AND_SETTLEMENT.md](CUSTODY_AND_SETTLEMENT.md), and [SETTLEMENT_ARCHITECTURE.md](SETTLEMENT_ARCHITECTURE.md).

- The configured reconciler/evidence attestor is a trust root, not cryptographic proof.
- RPC-origin quorum is corroboration, not a NEAR light client.
- Escrow payout legs are sequential asynchronous transfers, not atomic.
- Tidepool is community-operated; test assets are synthetic.
- No per-position Ondo collateral reservation inside Intents is demonstrated.

## E-009 — Read-only dual-RPC audit of the deployed Testnet contracts

| Field | Value |
|---|---|
| Script | [scripts/audit-testnet-state.mjs](../scripts/audit-testnet-state.mjs) — view calls only, no transactions |
| RPCs | `https://rpc.testnet.fastnear.com`, `https://near-testnet.drpc.org` |
| Agreement | Both providers returned identical code hashes, view values and execution outcomes |
| Options code | `1d95e9b75d94c13eea83e708502aff0a4c54c7eee4bb09881482403bb9479ab3`, 425,264 bytes |
| Escrow code | `a7d7f1184d813a94c5d1c431ebef01489720e906b4a6d4cf89b957d7245ab604`, 302,940 bytes |
| Deployed-code gaps | `get_position_count()`, `get_escrow_token_account({"asset_id":"nep141:usdc…"})`, `get_escrow_token_account({"asset_id":"nep141:wnear…"})` all return `MethodResolveError(MethodNotFound)` |
| Escrow state | `get_owner` = `escrow.shaydez.testnet`, `get_pending_owner` = null, `get_demo_self_trade` = false |
| Options state | `get_owner` = `options.shaydez.testnet`, USDC/WNEAR assets enabled with 6/24 decimals; agent policy = null; execution mode = `ManualApproval` |
| Token state | Escrow, Options and agent accounts have `storage_balance_of` = null and `ft_balance_of` = 0 for both test tokens; the principal holds 100 USDC and 40 wNEAR |
| Agent keys | 5 total; 2 scoped to `create_agent_proposal`, 2 FunctionCall keys restricted to `agent_create_call`, `agent_create_put`, `agent_begin_collateral_lock`, `agent_register_escrow_position` with a 1 NEAR allowance, and 1 `FullAccess` key `ed25519:65juguXQ8RSvCry9mHiQWBpAFZ2v8qgJ38WWFRy3dt62` |
| Exit code | 2 (strict failure while the deployed code lacks required views) |

**Proves:** the deployed Wasm, view state, token registration and agent key set at audit time, agreed by two independent RPC providers, and that the deployed OptionsContract predates the read-only views added to `src/lib.rs`.  
**Does not prove:** that the source on `main` is deployed, that the Escrow controller/paused state is correct (no public getter exists), or that any authorized trade has occurred. The `FullAccess` agent key is a policy violation that only the agent account owner can remove.

## E-010 — Receipt indexer verified against PostgreSQL

| Field | Value |
|---|---|
| Database | Local PostgreSQL 16 (`postgres:16-alpine`) |
| RPC | `https://rpc.testnet.fastnear.com` |
| Start height | 277435463 (Escrow deployment, resolved from its transaction receipt) |
| Indexed transaction | `DrQ8m91nef1uzZ11aVcG5B7i8FvLCHqZMKryp496gqeR`, two receipts, heights 277435463 and 277435464 |
| Replay | Cursor reset to 277435463 and re-run; counts unchanged at 1 transaction / 2 receipts; cursor advanced to 277435473 |
| Health | `/health` reports `ok:false` with `NEAR final view call failed: wasm execution failed with error: MethodResolveError(MethodNotFound)` |

**Proves:** finalized transactions and receipt outcomes persist to PostgreSQL with real block heights, `/v1/receipts` and `/v1/activity` serve them, the cursor survives a process restart and replay is idempotent.  
**Does not prove:** position snapshot indexing (blocked by the deployed-code gap), event history beyond the configured start height, or operation against a hosted production database.

## Evidence still required before stronger claims

- [x] Record the Escrow account's independently fetched deployed code hash and compare it to the intended artifact. See E-009.
- [x] Record the latest `main` frontend typecheck and production-build result after PR #33.
- [x] Verify receipt indexing, cursor persistence and idempotent replay against PostgreSQL. See E-010.
- [ ] Upgrade `options.shaydez.testnet` so `get_position_count` and `get_escrow_token_account` exist (owner-signed Wasm upgrade).
- [ ] Remove the agent account's `FullAccess` key and set the agent policy (agent-account owner signature).
- [ ] Register Escrow and Options accounts in both Testnet tokens with a storage deposit (account-owner signature).
- [ ] Record finalized Testnet policy, execution mode, agent FunctionCall key scope/allowance and Escrow controller state.
- [ ] Record an authorized delegated Testnet create + Escrow registration with transaction hashes and final state.
- [ ] Record principal-signed collateral and holder-signed premium transactions using Tidepool test tokens.
- [ ] Record policy-limit and post-revocation failed receipts from Testnet.
- [ ] Deploy current `main` to Vercel and verify the production alias commit.
- [ ] For Ondo: archive the exact 1Click token registry entries, asset IDs/decimals/standards, route quotes, enforceable reservation proof and paired settlement evidence. Do not attempt to substitute Tidepool assets for Ondo.
