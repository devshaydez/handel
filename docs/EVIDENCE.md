# Evidence ledger

**Snapshot:** 2026-11-13  
**Repository:** [devshaydez/handel](https://github.com/devshaydez/handel)  
**Rule:** each row states exactly what the artifact proves and what it does not prove. A successful build, deployment or dry quote is never promoted into evidence of a complete trade.

## E-001 — Latest main CI

| Field | Value |
|---|---|
| Workflow | [Handel backend checks, run #43474798000](https://github.com/devshaydez/handel/actions/runs/43474798000) |
| Commit | `b07eeafcdcaadf8c1b397e61eb4cbb9638369a36` |
| Date | 2026-11-13 |
| Result | 6 jobs succeeded; frontend typecheck/build job was skipped |

Successful jobs:
- Rust format, unit tests and Wasm build
- TypeScript SDK build and offline demo
- Live Testnet asset verification (read-only)
- Windows PowerShell proof-runner syntax
- NEAR AI credential and model-catalogue preflight
- Live NEAR AI → SDK → Sandbox contract proof

**Proves:** these named CI jobs passed on the recorded commit. PR [#33](https://github.com/devshaydez/handel/pull/33) adds frontend checks to main pushes; its result must be recorded separately after completion.  
**Does not prove:** frontend build/typecheck on this commit, a real Testnet trade, Ondo asset support, Mainnet settlement, production custody or security audit.

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

## E-007 — Production deployment lag

The latest inspected READY production deployment is `dpl_3kuxaHaxroUCmHzzWrbfMptDtRSt`, Git commit `12c8222ab639cce05ee01ea27bae43a2e95f8eb0`. The verified custom domain `handel-live.vercel.app` returned HTTP 200. The repository `main` commit at this evidence snapshot is `b07eeafcdcaadf8c1b397e61eb4cbb9638369a36`, so production is behind main and needs redeployment after CI passes.

**Proves:** production alias is behind current `main` at the time checked.  
**Does not prove:** the latest source is deployed or the current UI matches repository source.

## E-008 — Trust and settlement boundary

See [THREAT_MODEL.md](THREAT_MODEL.md), [CUSTODY_AND_SETTLEMENT.md](CUSTODY_AND_SETTLEMENT.md), and [SETTLEMENT_ARCHITECTURE.md](SETTLEMENT_ARCHITECTURE.md).

- The configured reconciler/evidence attestor is a trust root, not cryptographic proof.
- RPC-origin quorum is corroboration, not a NEAR light client.
- Escrow payout legs are sequential asynchronous transfers, not atomic.
- Tidepool is community-operated; test assets are synthetic.
- No per-position Ondo collateral reservation inside Intents is demonstrated.

## Evidence still required before stronger claims

- [ ] Record the Escrow account's independently fetched deployed code hash and compare it to the intended artifact.
- [ ] Record finalized Testnet policy, execution mode, agent FunctionCall key scope/allowance and Escrow controller state.
- [ ] Record an authorized delegated Testnet create + Escrow registration with transaction hashes and final state.
- [ ] Record principal-signed collateral and holder-signed premium transactions using Tidepool test tokens.
- [ ] Record policy-limit and post-revocation failed receipts from Testnet.
- [ ] Run frontend typecheck and production build against the latest `main` commit (PR #33 enables this on main pushes).
- [ ] Deploy current `main` to Vercel and verify the production alias commit.
- [ ] For Ondo: archive the exact 1Click token registry entries, asset IDs/decimals/standards, route quotes, enforceable reservation proof and paired settlement evidence. Do not attempt to substitute Tidepool assets for Ondo.
