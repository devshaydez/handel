# Evidence ledger

**Snapshot:** 2026-11-14  
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

### E-002 — OptionsContract Testnet deployment

| Field | Value |
|---|---|
| Account | `options.shaydez.testnet` |
| Deployment transaction | [5VL24bzw5XHdFunUZoWFGJ6ZVaC8uoHLRvLgT8fSmZzz](https://explorer.testnet.near.org/transactions/5VL24bzw5XHdFunUZoWFGJ6ZVaC8uoHLRvLgT8fSmZzz) |
| Wasm artifact | `target/near/handel/_options.wasm` |
| Size | 425,264 bytes |
| SHA-256 | `1d95e9b75d94c13eea83e708502aff0a4c54c7eee4bb09881482403bb9479ab3` |

A user-run Testnet `view_code` retrieval was hashed locally and reported an exact byte-for-byte match with this artifact.

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

The inspected READY deployment [`dpl_BS2BSRCAqc9VEs9hns9Mpa6chaBC`](https://vercel.com/shaydyting-2601s-projects/handel-frontend/BS2BSRCAqc9VEs9hns9Mpa6chaBC) was built from commit `418eeea5a55f1b58232a608a92c9fe21fc6ceafd`; its aliases included `handel-live.vercel.app`. This is the deployment observed at the time of the backend gap-register check, not proof that the latest `main` commit is deployed.

### E-009 — Dual-RPC audit of deployed Testnet state

[Read-only audit script](../scripts/audit-testnet-state.mjs) queried:

- `https://rpc.testnet.fastnear.com`
- `https://near-testnet.drpc.org`

Both RPC providers returned matching code hashes, view values and execution outcomes.

| Check | Observed result |
|---|---|
| Options Wasm | SHA-256 `1d95e9b75d94c13eea83e708502aff0a4c54c7eee4bb09881482403bb9479ab3`; 425,264 bytes |
| Escrow Wasm | SHA-256 `a7d7f1184d813a94c5d1c431ebef01489720e906b4a6d4cf89b957d7245ab604`; 302,940 bytes |
| Options views | `get_position_count()` and both `get_escrow_token_account(...)` calls returned `MethodResolveError(MethodNotFound)` |
| Escrow views | Owner = `escrow.shaydez.testnet`; pending owner = null; demo self-trade = false |
| Options views | Owner = `options.shaydez.testnet`; USDC/WNEAR enabled with 6/24 decimals; agent policy = null; execution mode = `ManualApproval` |
| Token accounts | Escrow, Options and agent accounts had no storage registration and zero USDC/wNEAR balances; principal held 100 USDC and 40 wNEAR |
| Agent keys | Five keys: two proposal-scoped, two restricted FunctionCall keys (four delegated methods, 1 NEAR allowance), and one FullAccess key |
| Audit result | Exit code 2: strict audit failure because required views were absent from deployed code |

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
- **Deployed delegated-agent readiness:** the audited Options policy was null and execution mode was `ManualApproval`; a FullAccess key remained on the agent account. Owner-authorized policy/key changes are not evidenced.
- **Token-account readiness:** the audited Escrow, Options and agent accounts were not registered or funded for USDC/wNEAR.
- **Current source deployed on Testnet:** the deployed Options Wasm lacked view methods present in source. An owner-signed upgrade and post-upgrade state/code verification are outstanding.
- **Indexer position snapshots / hosted operation:** position indexing is blocked by the deployed view gap; the recorded PostgreSQL test was local.
- **Ondo / NEAR Intents support:** no exact Ondo asset registry/ID/standard evidence, Intents custody, solver fill, enforceable per-position collateral reservation, or paired settlement is recorded. Tidepool assets are synthetic test assets.
- **Trustless settlement:** the configured reconciler/attestor is a trust assumption; RPC quorum is corroboration, not a NEAR light client. Escrow payout legs are sequential asynchronous transfers, not atomic.
- **Production parity:** the inspected Vercel deployment was built from `418eeea`, not the later `main` snapshot.

For the design and security boundaries behind these items, see [THREAT_MODEL.md](THREAT_MODEL.md), [CUSTODY_AND_SETTLEMENT.md](CUSTODY_AND_SETTLEMENT.md), and [SETTLEMENT_ARCHITECTURE.md](SETTLEMENT_ARCHITECTURE.md).
