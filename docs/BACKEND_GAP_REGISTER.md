# Backend gap register

**Snapshot:** 2026-11-13  
**Purpose:** current release-gate register. Historical batch implementation notes are retained in the linked documents; this file does not treat old status snapshots as current evidence.

## Current verified state

- Latest `main`: `371fe36c3ee376a294714d06b79c73a1170fe70c`.
- Latest CI: [run #43425939138](https://github.com/devshaydez/handel/actions/runs/43425939138). Six jobs passed; frontend typecheck/build was skipped.
- OptionsContract Testnet code hash was checked against the local 425,264-byte Wasm artifact; SHA-256 matched `1d95e9b75d94c13eea83e708502aff0a4c54c7eee4bb09881482403bb9479ab3`.
- Delegated Testnet Call/Put create-and-register implementation, restricted signer and Assistant composer exist in source.
- No complete live two-party Testnet lifecycle is recorded. No Ondo asset settlement is established.
- Vercel production alias is behind `main`; it was last inspected at `67f6dd01c55932f39411c36fdfcc4f46f1a2aefb`.

## P0 — Before claiming a live Ondo options product

1. **Ondo asset admission and route:** archive the official Intents token registry response for NVDAon, TSLAon, AAPLon and SPYon; verify exact IDs, chain, token standard and decimals. Tidepool's registry does not establish these assets.
2. **Per-position collateral reservation:** design and prove a mechanism that prevents a writer withdrawing or reusing the exact underlying/USDC collateral while an option is open. An account balance or quote is not a lock.
3. **NEP-245 / Intents custody:** replace or adapt the NEP-141-only Escrow path if the exact Ondo asset is an Intents internal balance. Demonstrate the supported authorization and transfer path.
4. **Settlement atomicity and recovery:** demonstrate paired physical delivery or document and obtain consent for non-atomic recovery semantics. Current escrow payout legs are sequential.
5. **External proof verification:** replace the trusted reconciler assertion with independently verified receipt/proof data, or keep ambiguous outcomes frozen. RPC quorum is not a light client.
6. **Pricing and market evidence:** approve an authoritative execution/risk source and independently validate spot, volatility, rate, dividend, quote freshness, token mechanics and unit conversion. The current Black–Scholes engine is reference-only and the delegated demo premium is fixed.

## P1 — Before claiming a complete Testnet lifecycle

1. Record finalized agent policy, Delegated mode, allowed asset, bounds, agent key receiver/method scope/allowance and Escrow controller state.
2. Execute one authorized synthetic Testnet flow: agent creates/registers; principal signs collateral; holder signs premium; record all transaction hashes, receipts, state and balances.
3. Capture live over-limit, disabled-policy and post-revocation failed receipts.
4. Independently fetch and compare the deployed Escrow Wasm hash; record its controller and configuration state.
5. Add recovery tests and run the full two-party wallet lifecycle against the exact deployed contracts and Tidepool test tokens.
6. Configure persistent indexer storage if durable Activity history is required; verify indexing restart/replay and account scope.

## P1 — Before treating hosting as current

1. Deploy current `main` commit `371fe36c3ee376a294714d06b79c73a1170fe70c` to Vercel.
2. Verify the production alias points to that commit and run production health plus safe route smoke checks.
3. Run frontend typecheck and production build; latest CI skipped this job.
4. Verify server-only token/session configuration and restricted key scopes without exposing secrets.

## P2 — Hardening and governance

- Independent security review of contract access control, callbacks, storage migration, pause semantics and settlement recovery.
- Multisig/timelock and role separation for owner, controller, guardian and reconciler.
- Account-key rotation/revocation runbook and incident response rehearsal.
- Durable monitoring, alert delivery, RPC health and stuck-state recovery.
- Fuzz/property tests and gas/storage regression thresholds.
- Storage reserve accounting, archival and refund design.
- Portfolio indexer completeness and persistent event history verification.

## Evidence labels

- **Implemented:** source code exists.
- **Unit-tested:** local unit tests cover the behavior.
- **Sandbox-tested:** local NEAR Sandbox test covers the behavior.
- **Testnet-deployed:** transaction deployed Wasm to Testnet.
- **Testnet-verified:** on-chain state/receipt/balance was independently inspected.
- **Production-deployed:** Vercel production alias points to the exact source commit.

Never promote a claim to a stronger label without adding its evidence to [EVIDENCE.md](EVIDENCE.md).

## Related design documents

- [Threat model](THREAT_MODEL.md)
- [Custody and settlement boundary](CUSTODY_AND_SETTLEMENT.md)
- [Settlement architecture](SETTLEMENT_ARCHITECTURE.md)
- [Ondo/NEAR Intents route gates](ONDO_NEAR_INTENTS_ROUTE.md)
- [Market data and pricing gates](MARKET_DATA_AND_PRICING_GATES.md)
