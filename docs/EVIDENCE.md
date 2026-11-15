# Evidence ledger

**Snapshot:** 2026-11-15  
**Repository:** [devshaydez/handel](https://github.com/devshaydez/handel)

This ledger separates observed results from implementation evidence and outstanding proof. Transaction links point to NEAR Testnet; CI links point to the exact workflow runs.

## Proven

### E-001 — CI and automated verification

| Commit / run | Result | Evidence |
|---|---|---|
| Current `main`, `46b7b1df6baac3984fbc1b8eae113e031f76a252` | Run #912: six of seven jobs passed; live NEAR AI → SDK → Sandbox proof was still running at the snapshot. | [Run #43647881908](https://github.com/devshaydez/handel/actions/runs/43647881908) |
| `418eeea5a55f1b58232a608a92c9fe21fc6ceafd` | All seven jobs passed, including Rust format/unit/Sandbox/Wasm, SDK build/tests, read-only Testnet asset checks, NEAR AI preflight, live AI → SDK → Sandbox proof, PowerShell syntax, and frontend typecheck/build. | [Run #43645266413](https://github.com/devshaydez/handel/actions/runs/43645266413) |
| `58c0f9f9ba73852365f4b4c5aca832bebb032d6b` | Five of six jobs completed successfully; the workflow was cancelled by a subsequent main push while the Rust/Sandbox/Wasm job was running. | [Run #43647596976](https://github.com/devshaydez/handel/actions/runs/43647596976) |
| Historical baseline `b07eeafcdcaadf8c1b397e61eb4cbb9638369a36` | Six jobs passed; frontend checks were skipped on that commit. [PR #33](https://github.com/devshaydez/handel/pull/33) later enabled frontend checks on main pushes. | [Run #43474798000](https://github.com/devshaydez/handel/actions/runs/43474798000) |

The latest completed all-jobs success is run #906. Run #912 is the current-main check; its final Sandbox proof had not completed when this snapshot was taken.

### E-002 — OptionsContract Testnet deployment and in-place upgrade

**Initial deployment (historical):**

| Field | Value |
|---|---|
| Account | `options.shaydez.testnet` |
| Deployment transaction | [5VL24bzw5XHdFunUZoWFGJ6ZVaC8uoHLRvLgT8fSmZzz](https://explorer.testnet.near.org/transactions/5VL24bzw5XHdFunUZoWFGJ6ZVaC8uoHLRvLgT8fSmZzz) |
| Recorded Wasm artifact | `target/near/handel_options.wasm` |
| Size | 425,264 bytes |
| SHA-256 | `1d95e9b75d94c13eea83e708502aff0a4c54c7eee4bb09881482403bb9479ab3` |

**In-place upgrade — owner-reported successful deployment, independently corroborated by two RPCs on 2026-11-15:**

| Field | Value |
|---|---|
| Account | `options.shaydez.testnet` |
| Audit block height | 277724568 |
| Audit block hash | `4n3tDwBrQVkppWUNSC3hDf3FvEw7gwHy4BKnvzhNrouq` |
| Deployed Wasm size | 436,180 bytes |
| Deployed code SHA-256 | `b9b67461f6f54428aedf2f3515e043470940f38acdec7f871eb3f28be8fcc715` |
| Independent RPCs | FastNEAR Testnet and dRPC Testnet |
| RPC agreement | Same Options code hash; audit reported `independentRpcAgreement: true` |
| Method-surface result | `deployedCodeGaps: []`; `rpcViewErrors: []` |

The post-upgrade audit successfully called `get_position_count` (0), `get_escrow_token_account` for USDC and wNEAR, `get_asset` for both assets, `get_agent_policy` (null), and `get_agent_execution_mode` (`ManualApproval`). The previous MethodNotFound gap is closed.


### E-003 — Escrow Testnet deployment

| Field | Value |
|---|---|
| Account | `escrow.shaydez.testnet` |
| Deployment transaction | [DrQ8m91nef1uzZ11aVcG5B7i8FvLCHqZMKryp496gqeR](https://explorer.testnet.near.org/transactions/DrQ8m91nef1uzZ11aVcG5B7i8FvLCHqZMKryp496gqeR) |
| Recorded artifact SHA-256 | `a7d7f1184d813a94c5d1c431ebef01489720e906b4a6d4cf89b957d7245ab604` |

The deployment transaction is recorded as deploy-only; initialization was omitted.

### E-004 — Tidepool Testnet read-only verification

- [CI run #43425939138](https://github.com/devshaydez/handel/actions/runs/43425939138) passed the configured Tidepool Testnet asset/verifier checks and a dry-quote request.
- The dry quote created no deposit address and submitted no transaction.
- [Token health snapshot](../evidence/tidepool-health.json) records Tidepool token metadata at capture time.

### E-005 — Offline and Sandbox lifecycle tests

- [Offline SDK lifecycle](../sdk/src/lifecycle-demo.ts): deterministic fallback proposal, local policy validation and illustrative payload construction.
- [Integrated proof runners](../scripts/run-e2e-proof-demo.sh) and [PowerShell runner](../scripts/run-e2e-proof-demo.ps1): NEAR AI/System One smoke, SDK preparation and local Sandbox contracts using mock NEP-141 assets.
- [Escrow registration tests](../contracts/escrow/tests/options_registration.rs): Call/Put registration, mock-token deposits, payout/callback and failure-path assertions.

These artifacts establish local deterministic and Sandbox behavior for the scenarios covered by the tests.

### E-006 — Delegated agent implementation

| Component | Evidence |
|---|---|
| Contract-side delegated entrypoints and policy checks | [src/lib.rs](../src/lib.rs) |
| Finalized-state policy/mode reads, restricted signer checks, Call/Put creation and Escrow registration | [sdk/src/agent-execution.ts](../sdk/src/agent-execution.ts) |
| FunctionCall receiver, method-scope and allowance checks; FullAccess refusal | [sdk/src/near-function-call-signer.ts](../sdk/src/near-function-call-signer.ts) |
| Principal authorization and separate collateral/premium signature requests | [TestnetProposalComposer.tsx](../frontend/src/components/TestnetProposalComposer.tsx) |
| Server-side bearer-token handling | [api/v1/delegated/trades.js](../api/v1/delegated/trades.js) |

The source and test suite establish the delegated implementation path. They do not establish that a real user-authorized two-party trade has completed on Testnet.

### E-007 — Vercel production deployment

The latest inspected READY production deployment at this snapshot is [`dpl_44hKab6taWS8NxXeXvWTreihGPke`](https://vercel.com/shaydyting-2601s-projects/handel-frontend/44hKab6taWS8NxXeXvWTreihGPke), built from current `main` commit `750e46ca00b9cee7f7176241bab0e358850d7113`. Its aliases include `handel-live.vercel.app`. The deployment is READY and matches `main` at the time of this snapshot; any subsequent `main` commit must be followed by its own successful production deployment.

### E-008 — Withdrawn

E-008 was withdrawn; no evidence item is claimed under this number.

### E-009 — Dual-RPC audit of deployed Testnet state

[Read-only audit script](../scripts/audit-testnet-state.mjs) was run after the OptionsContract in-place upgrade on 2026-11-15. It queried:

- `https://rpc.testnet.fastnear.com`
- `https://near-testnet.drpc.org`

The supplied output reported `mode: READ_ONLY`, `transactionsSubmitted: 0`, `independentRpcAgreement: true`, `rpcViewErrors: []`, and `deployedCodeGaps: []`. Both providers returned the same Options and Escrow code hashes and corroborating view results.

**OptionsContract post-upgrade snapshot**

| Check | Observed result |
|---|---|
| Account owner | `options.shaydez.testnet` |
| Wasm | SHA-256 `b9b67461f6f54428aedf2f3515e043470940f38acdec7f871eb3f28be8fcc715`; 436,180 bytes |
| Audit block | Height 277724568; hash `4n3tDwBrQVkppWUNSC3hDf3FvEw7gwHy4BKnvzhNrouq` |
| Required views | `get_position_count` returned 0; USDC and wNEAR `get_escrow_token_account` views returned the expected Tidepool token accounts |
| Asset configuration | USDC enabled (6 decimals); wNEAR enabled (24 decimals) |
| Agent policy | `get_agent_policy` returned null |
| Agent execution mode | `ManualApproval` |
| Method gaps / RPC view errors | None reported |

**Escrow and token snapshot**

| Check | Observed result |
|---|---|
| Escrow Wasm | SHA-256 `a7d7f1184d813a94c5d1c431ebef01489720e906b4a6d4cf89b957d7245ab604`; 302,940 bytes |
| Escrow owner | `escrow.shaydez.testnet` |
| Escrow demo self-trade | false |
| Token account mappings | OptionsContract maps the USDC and wNEAR asset IDs to `usdc.tidepool-sandbox.testnet` and `wnear.tidepool-sandbox.testnet` |

**Agent key snapshot**

The refreshed on-chain key audit reported four FunctionCall keys and zero FullAccess keys for `handel-agent.shaydez.testnet`:

- Two keys scoped to `create_agent_proposal`.
- Two keys scoped to `agent_create_call`, `agent_create_put`, `agent_begin_collateral_lock`, and `agent_register_escrow_position`.
- Each key had a 1 NEAR allowance and receiver `options.shaydez.testnet`.

The prior E-009 snapshot (2026-11-14) recorded missing OptionsContract views and a FullAccess agent key. The 2026-11-15 post-upgrade audit supersedes those observations for deployed code and the current key set.

### E-010 — Receipt indexer and PostgreSQL replay

| Field | Value |
|---|---|
| Database | Local PostgreSQL 16 (`postgres:16-alpine`) |
| RPC | `https://rpc.testnet.fastnear.com` |
| Start height | 277435463 |
| Indexed transaction | [DrQ8m91nef1uzZ11aVcG5B7i8FvLCHqZMKryp496gqeR](https://explorer.testnet.near.org/transactions/DrQ8m91nef1uzZ11aVcG5B7i8FvLCHqZMKryp496gqeR) |
| Receipts | Two receipts at heights 277435463 and 277435464 |
| Replay | Reset to height 277435463; replay retained 1 transaction / 2 receipts and advanced cursor to 277435473 |

The test established persistence of finalized transaction/receipt outcomes, serving through `/v1/receipts` and `/v1/activity`, cursor survival across process restart, and idempotent replay. The indexer's `/health` endpoint reported `ok:false` because a final view call failed with `MethodResolveError(MethodNotFound)`.

## Not proven

The evidence above does **not** establish the following:

- **Completed live two-party Testnet lifecycle:** no recorded transaction set proves delegated creation and Escrow registration followed by principal-signed collateral and holder-signed premium funding, with final balances and position state.
- **Deployed delegated-agent readiness:** the 2026-11-15 audit confirms zero FullAccess keys but four restricted FunctionCall keys. The policy remains null and execution mode remains `ManualApproval`; bounded policy activation and a delegated execution test are outstanding.
- **Token-account readiness:** the post-upgrade audit still found null NEP-145 storage registrations for OptionsContract and Escrow and zero token balances for those contracts. Registration and funding are outstanding.
- **Indexer position snapshots / hosted operation:** position indexing is blocked by the deployed view gap; the recorded PostgreSQL test was local.
- **Ondo / NEAR Intents support:** no exact Ondo asset registry/ID/standard evidence, Intents custody, solver fill, enforceable per-position collateral reservation, or paired settlement is recorded. Tidepool assets are synthetic test assets.
- **Trustless settlement:** the configured reconciler/attestor is a trust assumption; RPC quorum is corroboration, not a NEAR light client. Escrow payout legs are sequential asynchronous transfers, not atomic.

For the design and security boundaries behind these items, see [THREAT_MODEL.md](THREAT_MODEL.md), [CUSTODY_AND_SETTLEMENT.md](CUSTODY_AND_SETTLEMENT.md), and [SETTLEMENT_ARCHITECTURE.md](SETTLEMENT_ARCHITECTURE.md).
