# Evidence ledger

**Snapshot:** 2026-11-15  
**Repository:** [devshaydez/handel](https://github.com/devshaydez/handel)

This ledger separates observed results from implementation evidence and outstanding proof. Transaction links point to NEAR Testnet; CI links point to the exact workflow runs.

## Proven

### E-001 — CI and automated verification

| Commit / run | Result | Evidence |
|---|---|---|
| Current `main`, `9a53f74c7c4a8d70df140e4a32fd7436cc3811d9` | Run #928 (run ID `43664154088`): all six jobs completed successfully; conclusion `success`. | [Run #43664154088](https://github.com/devshaydez/handel/actions/runs/43664154088) |
| `418eeea5a55f1b58232a608a92c9fe21fc6ceafd` | All seven jobs passed, including Rust format/unit/Sandbox/Wasm, SDK build/tests, read-only Testnet asset checks, NEAR AI preflight, live AI → SDK → Sandbox proof, PowerShell syntax, and frontend typecheck/build. | [Run #43645266413](https://github.com/devshaydez/handel/actions/runs/43645266413) |
| `58c0f9f9ba73852365f4b4c5aca832bebb032d6b` | Five of six jobs completed successfully; the workflow was cancelled by a subsequent main push while the Rust/Sandbox/Wasm job was running. | [Run #43647596976](https://github.com/devshaydez/handel/actions/runs/43647596976) |
| Historical baseline `b07eeafcdcaadf8c1b397e61eb4cbb9638369a36` | Six jobs passed; frontend checks were skipped on that commit. [PR #33](https://github.com/devshaydez/handel/pull/33) later enabled frontend checks on main pushes. | [Run #43474798000](https://github.com/devshaydez/handel/actions/runs/43474798000) |

The latest completed workflow run on `main` is run #928 (run ID `43664154088`), and it completed successfully on head commit `9a53f74c7c4a8d70df140e4a32fd7436cc3811d9`. All six jobs passed: NEAR AI credential and model-catalogue preflight; Windows PowerShell proof-runner syntax; TypeScript SDK build and offline demo; frontend typecheck and production build; Rust format, unit tests, and Wasm build; and live Testnet asset verification (read-only).

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

E-006 records the source and test-suite implementation evidence. Subsequent live Testnet execution and two-party premium-settlement evidence is recorded separately in E-011.

### E-007 — Vercel production deployment

The latest READY production deployment [`dpl_8w7HjmkE374TzLBGQea4ii914hFa`](https://vercel.com/shaydyting-2601s-projects/handel-frontend/8w7HjmkE374TzLBGQea4ii914hFa) is built from `main` commit `9a53f74c7c4a8d70df140e4a32fd7436cc3811d9`, with alias `handel-live.vercel.app`. Vercel reports the deployment state as `READY` and its Git source as branch `main` at that exact SHA. This verifies the production deployment for the documented snapshot commit; later documentation-only commits are not part of that deployment.

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

### E-011 — Live Testnet lifecycle and delegated-agent proofs (2026-11-15)

**Network and accounts:** NEAR Testnet. Principal/writer: `shaydez.testnet`; delegated agent: `handel-agent.shaydez.testnet`; OptionsContract: `options.shaydez.testnet`; Escrow: `escrow.shaydez.testnet`. The configured asset is the synthetic Tidepool Testnet token `wnear.tidepool-sandbox.testnet`; the premium/strike asset is USDC.

**Delegated-agent policy and mode**

The principal set the delegated policy with:
- Allowed asset: `nep141:wnear.tidepool-sandbox.testnet`.
- Maximum underlying: 1 wNEAR.
- Maximum premium: 5 USDC.
- Maximum collateral: 100 USDC.
- Maximum open positions: 3.

The agent execution mode was set to `Delegated` in [transaction 4adF37qomsMVGc2CYYggEmdLzwpzP2xcredmyfZt8Yo7](https://explorer.testnet.near.org/transactions/4adF37qomsMVGc2CYYggEmdLzwpzP2xcredmyfZt8Yo7). After the revoke test below, the policy was set again in [transaction 8WXwSp5CgN2Zpgwkt1pL2reCsaZQuwYRQJ2NAiR1DAGf](https://explorer.testnet.near.org/transactions/8WXwSp5CgN2Zpgwkt1pL2reCsaZQuwYRQJ2NAiR1DAGf).

**Position 0 — delegated creation and Escrow collateral lock**

Terms: Call; writer `shaydez.testnet`; holder `handel-holder-demo.testnet`; 1 wNEAR underlying; 10 USDC strike; 5 USDC premium.

| Action | Testnet transaction |
|---|---|
| `agent_create_call` | [9ehWG5qf3KRj5fwofqfFL4KpmuHi6FfPAL5jckhzp3wL](https://explorer.testnet.near.org/transactions/9ehWG5qf3KRj5fwofqfFL4KpmuHi6FfPAL5jckhzp3wL) |
| `agent_register_escrow_position` | [HxQHdqaNoz168fQFSjwcv4Da97aBqBTigUEdMrhZWv4Y](https://explorer.testnet.near.org/transactions/HxQHdqaNoz168fQFSjwcv4Da97aBqBTigUEdMrhZWv4Y) |
| Writer collateral lock | [47SYKprXmmB5c1CF4ZuirmkMj2gqcg8tak8rRjNZg5Vn](https://explorer.testnet.near.org/transactions/47SYKprXmmB5c1CF4ZuirmkMj2gqcg8tak8rRjNZg5Vn) |

Observed Escrow state: `CollateralLocked`. Premium was **not paid** on Position 0.

**Guardrail rejection and principal revocation**

| Test | Observed result | Testnet transaction |
|---|---|---|
| Agent attempted 2 wNEAR against the 1 wNEAR maximum | Contract panic: `size exceeds limit` | [F4ZuUNs7Gi6oyRD1fyEc5fEejdhoEtUqEXVt1EDRvnr6](https://explorer.testnet.near.org/transactions/F4ZuUNs7Gi6oyRD1fyEc5fEejdhoEtUqEXVt1EDRvnr6) |
| Principal called `revoke_agent` | Revocation transaction | [A3NMWGA3WB5SCDddhPpvKzghbt4Vo7xa9EFprvCiWwhs](https://explorer.testnet.near.org/transactions/A3NMWGA3WB5SCDddhPpvKzghbt4Vo7xa9EFprvCiWwhs) |
| Agent attempted another create after revocation | Contract panic: `agent revoked` | [FggGj3vFcP5umQ1LqTvF7hjocjX82Whzaf7QbaLYThbz](https://explorer.testnet.near.org/transactions/FggGj3vFcP5umQ1LqTvF7hjocjX82Whzaf7QbaLYThbz) |

**Position 1 — writer-signed creation and two-party funding**

Terms: Call; writer `shaydez.testnet`; holder `handel-buyer-15687.testnet`; 1 wNEAR underlying; 10 USDC strike; 5 USDC premium.

| Action | Testnet transaction |
|---|---|
| Writer `create_call` | [5Woqtp8fvwKmucj5kKStN9UGFpJ4mTbKGtP6grNcHw5H](https://explorer.testnet.near.org/transactions/5Woqtp8fvwKmucj5kKStN9UGFpJ4mTbKGtP6grNcHw5H) |
| `register_escrow_position` | [61agMMu5KmeDrXqJScbQBJp6pjgDvF4vv18VLzESgio3](https://explorer.testnet.near.org/transactions/61agMMu5KmeDrXqJScbQBJp6pjgDvF4vv18VLzESgio3) |
| Writer collateral lock | [33SdQaGhb7ByRxfqoCyZ7Nu6t9qNsg4uCxYkX4HiZD5X](https://explorer.testnet.near.org/transactions/33SdQaGhb7ByRxfqoCyZ7Nu6t9qNsg4uCxYkX4HiZD5X) |
| Holder `ft_transfer_call` for premium | [HmCQGHRGyo2PksPaBe6odz1pNY27MAnhzJ1JUn5fwf8M](https://explorer.testnet.near.org/transactions/HmCQGHRGyo2PksPaBe6odz1pNY27MAnhzJ1JUn5fwf8M) |
| Holder `settle_premium` | [7yfM4BUKJNoxMWGcNLBxBiG6kKYHQUeVVVDuPcjFP8zX](https://explorer.testnet.near.org/transactions/7yfM4BUKJNoxMWGcNLBxBiG6kKYHQUeVVVDuPcjFP8zX) |

Observed result: `premium paid=true`, `received=true`, and no payout failure. Escrow state was `CollateralLocked`. The writer's USDC balance increased by 5,000,000 base units. This records collateral and premium funding; it does not claim exercise or expiry settlement.

**Post-activity dual-RPC audit**

The read-only audit queried two independent Testnet RPCs at blocks 277851588–277851592. It reported `independentRpcAgreement: true`, `rpcViewErrors: []`, and `deployedCodeGaps: []`.

| Check | Observed result |
|---|---|
| Options Wasm SHA-256 | `b9b67461f6f54428aedf2f3515e043470940f38acdec7f871eb3f28be8fcc715` |
| Escrow Wasm SHA-256 | `a7d7f1184d813a94c5d1c431ebef01489720e906b4a6d4cf89b957d7245ab604` |
| Agent execution mode | `Delegated` |
| Agent FunctionCall keys | Four: two scoped only to `create_agent_proposal`; two scoped to the four delegated methods |
| FullAccess keys | Zero |

This evidence establishes a delegated Call creation and Escrow registration/collateral-lock path, policy-limit and revocation rejections, and a separate writer/holder path with successful premium receipt. It does not establish exercise or expiry settlement.

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

- **Completed live two-party Testnet lifecycle:** the lifecycle is proven through premium settlement (E-011, position 1); exercise, expiry and collateral return have not been run on-chain yet.
- **Deployed delegated-agent readiness:** policy, Delegated mode, delegated create plus Escrow registration, over-limit rejection and post-revoke rejection are proven (E-011, position 0). Agent-driven collateral and premium transfers are intentionally impossible; they require the writer's and holder's own signatures.
- **Token-account readiness:** Escrow accepted wNEAR collateral and USDC premium transfers (E-011). This does not establish Options-contract token registration.
- **Indexer position snapshots / hosted operation:** position indexing is blocked by the deployed view gap; the recorded PostgreSQL test was local.
- **Ondo / NEAR Intents support:** no exact Ondo asset registry/ID/standard evidence, Intents custody, solver fill, enforceable per-position collateral reservation, or paired settlement is recorded. Tidepool assets are synthetic test assets.
- **Trustless settlement:** the configured reconciler/attestor is a trust assumption; RPC quorum is corroboration, not a NEAR light client. Escrow payout legs are sequential asynchronous transfers, not atomic.

For the design and security boundaries behind these items, see [THREAT_MODEL.md](THREAT_MODEL.md), [CUSTODY_AND_SETTLEMENT.md](CUSTODY_AND_SETTLEMENT.md), and [SETTLEMENT_ARCHITECTURE.md](SETTLEMENT_ARCHITECTURE.md).
