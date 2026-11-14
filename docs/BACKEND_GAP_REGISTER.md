# Backend gap register

**Snapshot:** 2026-11-14 (checked against `main` before this documentation-only update)  
**Purpose:** current release-gate register. Historical handoffs and readiness snapshots live in [archive/](archive/); use this file with [EVIDENCE.md](EVIDENCE.md) for current status.

## Current verified state

- **Repository baseline:** `main` was `418eeea5a55f1b58232a608a92c9fe21fc6ceafd` when this status was checked. This update changes documentation only; re-read the branch head after the commit.
- **Latest main CI at that baseline:** [run #43645266413](https://github.com/devshaydez/handel/actions/runs/43645266413) completed successfully. All seven jobs passed: Rust format/unit/Sandbox/Wasm, SDK build/tests/offline demo, read-only Testnet asset verification, PowerShell proof-runner syntax, NEAR AI preflight, live NEAR AI → SDK → Sandbox proof, and **frontend typecheck plus production build**. This supersedes the older skipped-frontend status in E-001; E-001 remains a historical evidence row.
- **OptionsContract deployment:** E-002 records the Testnet Wasm hash match. E-009's later dual-RPC audit confirms that hash, but also shows the deployed contract predates source views: `get_position_count` and `get_escrow_token_account` return `MethodResolveError(MethodNotFound)`. Source and deployed contract are therefore not feature-identical.
- **Escrow deployment:** E-003 records the deployment; E-009 independently re-read the deployed Escrow hash and matched the recorded artifact. The public audit did not establish all controller/paused configuration state.
- **Agent state at E-009 audit:** Options policy is `null`, execution mode is `ManualApproval`; two proposal FunctionCall keys and two restricted delegated FunctionCall keys were present, alongside one **FullAccess** key. The restricted keys were scoped to the four delegated methods with a 1 NEAR allowance. The FullAccess key is an owner-action security gap; do not describe the deployed agent as ready for delegated execution.
- **Test-token readiness at E-009 audit:** Escrow, Options and agent accounts had no storage registration and zero USDC/wNEAR balances. The principal had 100 USDC and 40 wNEAR. Required token storage deposits/registrations and funding remain incomplete.
- **Lifecycle evidence:** E-005 proves offline/Sandbox behavior; E-006 proves the delegated implementation path exists. Neither records a completed live two-party Testnet lifecycle. No Ondo settlement is established.
- **Indexer:** E-010 proves local PostgreSQL receipt persistence, cursor restart and idempotent replay. Its health check remains `ok:false` because the deployed OptionsContract lacks a required view method; position snapshot indexing is not yet proven.
- **Vercel production:** inspected READY deployment [`dpl_BS2BSRCAqc9VEs9hns9Mpa6chaBC`](https://vercel.com/shaydyting-2601s-projects/handel-frontend/BS2BSRCAqc9VEs9hns9Mpa6chaBC) was built from commit `418eeea5a55f1b58232a608a92c9fe21fc6ceafd`; its aliases include `handel-live.vercel.app`. Thus the older E-007 claim that production was still at `12c8222` is superseded by this newer deployment inspection. This register's own documentation-only commit is newer than that inspected build; recheck the alias after any subsequent app-code release.

## P0 — Before claiming a live Ondo options product

1. **Ondo asset admission and route:** archive the official Intents token-registry response for NVDAon, TSLAon, AAPLon and SPYon; verify exact IDs, chain, token standard and decimals. Tidepool metadata does not establish Ondo asset support. See [Ondo/NEAR Intents route gates](ONDO_NEAR_INTENTS_ROUTE.md).
2. **Per-position collateral reservation:** prove that the exact underlying/USDC collateral cannot be withdrawn or reused while an option is open. An account balance or quote is not a lock.
3. **NEP-245 / Intents custody:** replace or adapt the NEP-141 Escrow path if the target asset is an Intents internal balance; prove the actual authorization and transfer path. See [settlement architecture](SETTLEMENT_ARCHITECTURE.md).
4. **Settlement atomicity and recovery:** demonstrate paired physical delivery or document and obtain consent for non-atomic recovery semantics. Current Escrow payout legs are sequential.
5. **External proof verification:** replace trusted reconciler assertions with independently verified receipt/proof data, or keep ambiguous outcomes frozen. RPC quorum is corroboration, not a light client.
6. **Pricing and market evidence:** approve an authoritative execution/risk source and independently validate spot, volatility, rate, dividend, quote freshness, token mechanics and unit conversion. The Black–Scholes engine is reference-only and the delegated demo premium is fixed.

## P1 — Before claiming a complete live Testnet lifecycle

1. Upgrade `options.shaydez.testnet` to source containing the required position/token-account views; owner-sign the upgrade and verify state preservation and deployed code hash.
2. Have the agent-account owner remove the deployed **FullAccess** key, then independently verify the remaining key set. Do not request or handle private keys in chat.
3. Have the relevant account owners register Options/Escrow token accounts and fund required NEP-141 storage; verify balances and storage registration on-chain.
4. Set and verify the intended agent policy and execution mode with owner authorization; record the finalized policy, asset allowlist, caps, revocation state, restricted key receiver/method scope and allowance.
5. Execute one authorized synthetic Tidepool two-party flow against the exact deployed contracts: agent create/register, principal-signed collateral, holder-signed premium, then capture transaction hashes, receipts, final state and balances.
6. Capture live over-limit, disabled-policy and post-revocation failed receipts; exercise payout/refund/recovery paths and retain the evidence.
7. Re-run the receipt indexer against the upgraded deployed views; require healthy position snapshots, durable cursor restart/replay and correct account scope.
8. Record the complete lifecycle evidence in [EVIDENCE.md](EVIDENCE.md). Until then, the repository has **no recorded completed live two-party lifecycle**.

## P1 — Before treating the production app as current

- The latest inspected READY production alias was mapped to the inspected `418eeea` deployment. Recheck `handel-live.vercel.app` after the documentation update and after every app-code release; verify the alias's exact commit, health and safe route smoke checks.
- Verify server-only token/session configuration and restricted key scopes without exposing secrets.

## P2 — Hardening and governance

- Independent security review of contract access control, callbacks, storage migration, pause semantics and settlement recovery.
- Replace single-owner authority with multisig/timelock and separate owner, controller, guardian and reconciler roles.
- Remove residual FullAccess agent authority; document key rotation/revocation and incident response.
- Durable monitoring, alert delivery, RPC health and stuck-state recovery.
- Fuzz/property tests and gas/storage regression thresholds.
- Storage reserve accounting, archival and refund design.
- Portfolio indexer completeness and persistent event-history verification.

## Evidence labels

- **Implemented:** source code exists.
- **Unit-tested:** local unit tests cover the behavior.
- **Sandbox-tested:** local NEAR Sandbox test covers the behavior.
- **Testnet-deployed:** transaction deployed Wasm to Testnet.
- **Testnet-verified:** on-chain state/receipt/balance was independently inspected.
- **Production-deployed:** Vercel production alias points to the exact source commit.

Never promote a claim to a stronger label without recording its evidence in [EVIDENCE.md](EVIDENCE.md).

## Related design documents

- [Threat model](THREAT_MODEL.md)
- [Custody and settlement boundary](CUSTODY_AND_SETTLEMENT.md)
- [Settlement architecture](SETTLEMENT_ARCHITECTURE.md)
- [Ondo/NEAR Intents route gates](ONDO_NEAR_INTENTS_ROUTE.md)
- [Market data and pricing gates](MARKET_DATA_AND_PRICING_GATES.md)
