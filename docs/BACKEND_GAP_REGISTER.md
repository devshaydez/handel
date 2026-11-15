# Backend gap register

**Snapshot:** 2026-11-14 (checked against `main` before this documentation-only update)  
**Purpose:** current release-gate register. Historical handoffs and readiness snapshots live in [archive/](archive/); use this file with [EVIDENCE.md](EVIDENCE.md) for current status.

## Current verified state

- **Evidence baseline:** the verified source snapshot is `main` commit `9a53f74c7c4a8d70df140e4a32fd7436cc3811d9`. Its latest completed CI run is [run ID 43664154088](https://github.com/devshaydez/handel/actions/runs/43664154088), conclusion `success`, with all six jobs passed. The documentation update that follows this snapshot does not change application or contract code.
- **OptionsContract deployment:** the 2026-11-15 in-place upgrade and post-upgrade dual-RPC verification are recorded in [E-002](EVIDENCE.md#e-002--optionscontract-testnet-deployment-and-in-place-upgrade) and [E-009](EVIDENCE.md#e-009--dual-rpc-audit-of-deployed-testnet-state). The audit reported matching Wasm hashes, no deployed code gaps and no RPC view errors.
- **Escrow and token transfers:** [E-011](EVIDENCE.md#e-011--live-testnet-lifecycle-and-delegated-agent-proofs-2026-11-15) records Escrow accepting wNEAR collateral and USDC premium transfers. This is not evidence of Options-contract token registration.
- **Delegated agent:** E-011 proves policy configuration, `Delegated` mode, delegated create and Escrow registration, an over-limit rejection, and a post-revocation rejection. The post-activity key audit found four restricted FunctionCall keys and zero FullAccess keys.
- **Live lifecycle:** E-011 position 1 proves a two-party option funded through premium settlement, including writer collateral and holder premium signatures. Exercise, expiry and collateral return have not been run on-chain. Agent-driven collateral and premium transfers are intentionally unavailable; the writer and holder must sign their own transfers.
- **Indexer:** E-010 records local PostgreSQL receipt persistence, cursor restart and idempotent replay. Position-snapshot completeness and hosted operation are not established. The historical E-010 health check reported `ok:false`; no later hosted health proof is recorded.
- **Vercel production:** the latest READY production deployment is [`dpl_8w7HjmkE374TzLBGQea4ii914hFa`](https://vercel.com/shaydyting-2601s-projects/handel-frontend/8w7HjmkE374TzLBGQea4ii914hFa), built from `main` SHA `9a53f74c7c4a8d70df140e4a32fd7436cc3811d9`, with alias `handel-live.vercel.app`.

## P0 — Before claiming a live Ondo options product

1. **Ondo asset admission and route:** archive the official Intents token-registry response for NVDAon, TSLAon, AAPLon and SPYon; verify exact IDs, chain, token standard and decimals. Tidepool metadata does not establish Ondo asset support. See [Ondo/NEAR Intents route gates](ONDO_NEAR_INTENTS_ROUTE.md).
2. **Per-position collateral reservation:** prove that the exact underlying/USDC collateral cannot be withdrawn or reused while an option is open. An account balance or quote is not a lock.
3. **NEP-245 / Intents custody:** replace or adapt the NEP-141 Escrow path if the target asset is an Intents internal balance; prove the actual authorization and transfer path. See [settlement architecture](SETTLEMENT_ARCHITECTURE.md).
4. **Settlement atomicity and recovery:** demonstrate paired physical delivery or document and obtain consent for non-atomic recovery semantics. Current Escrow payout legs are sequential.
5. **External proof verification:** replace trusted reconciler assertions with independently verified receipt/proof data, or keep ambiguous outcomes frozen. RPC quorum is corroboration, not a light client.
6. **Pricing and market evidence:** approve an authoritative execution/risk source and independently validate spot, volatility, rate, dividend, quote freshness, token mechanics and unit conversion. The Black–Scholes engine is reference-only and the delegated demo premium is fixed.

## P1 — Remaining before complete live Testnet lifecycle

- [x] OptionsContract in-place upgrade and dual-RPC verification (E-002/E-009).
- [x] Restricted agent FunctionCall keys verified; zero FullAccess keys (E-011 post-activity audit).
- [x] Principal policy configured and execution mode set to `Delegated` (E-011).
- [x] Delegated option creation and Escrow registration (E-011, position 0).
- [x] Writer collateral transfer and holder premium transfer, with premium settlement confirmed (E-011, position 1).
- [x] Over-limit and post-revocation agent calls rejected (E-011).
- [ ] Exercise, expiry, collateral return, payout retry/refund and ambiguous-outcome recovery on-chain.
- [ ] Options-contract token registration and storage/balance verification; E-011 proves Escrow accepted the two token transfers, not Options-contract registration.
- [ ] Position-snapshot indexing, hosted indexer health, monitoring and durable operations.
- [ ] Independent security review and explicit release approval.

## P1 — Before treating the production app as current

- [x] Latest inspected READY production deployment maps `handel-live.vercel.app` to commit `9a53f74c7c4a8d70df140e4a32fd7436cc3811d9` (Vercel deployment record linked in E-007).
- [ ] Verify production health and safe route smoke checks after each app-code release.
- [ ] Verify server-only token/session configuration without exposing secrets.

## P2 — Hardening and governance

- Independent security review of contract access control, callbacks, storage migration, pause semantics and settlement recovery.
- Replace single-owner authority with multisig/timelock and separate owner, controller, guardian and reconciler roles.
- Maintain restricted agent-key scope; document key rotation/revocation and incident response.
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
