# Handel testnet backend plan

## Agreed scope

- NEAR contract development and demo target: NEAR Testnet.
- No mainnet deployment, real-asset custody, or real-fund operation.
- Backend first; defer the frontend until the user supplies their existing UI.
- Deterministic local AI proposal fallback now; add NEAR AI Cloud adapter later when the user has access.
- Never request or commit wallet secrets or API credentials.

## Intents/Testnet boundary

The hackathon materials describe no official NEAR Intents Testnet. A community-operated sandbox called Tidepool now advertises a Testnet deployment of the official, unmodified Intents verifier and a 1Click-compatible API. It is not affiliated with NEAR/1Click and uses a single maker. Its published token list does not include Handel's BNB-chain Ondo assets; the ondoTokens query is documented as ignored.

Tidepool can be evaluated as an optional integration harness using its own clearly labelled test assets. It does not make the current Ondo asset IDs usable on Testnet and does not replace the offline mock. See docs/SETTLEMENT_ARCHITECTURE.md.

## Implementation status

### Completed in the work branch

- Explicit contract owner initialized from the initializer's predecessor account, with owner-authorized transfer.
- Owner authorization for administrative methods and pause state.
- GitHub Actions for Rust formatting, contract tests, Wasm build, SDK build/tests, and offline lifecycle demo.
- SDK lifecycle states and call builders aligned with the Rust contract methods.
- Deterministic local proposal fallback and SDK argument-mapping tests.
- Writer-only collateral retry and holder-only premium retry after definitive failure, with fresh operation IDs and pause checks.
- Exercise payment/delivery retry paths and late-receipt handling.
- Agent policy includes max_collateral_usdc and rejects put proposals above the cap.
- European exercise timing: no exercise before maturity, a 24-hour transaction-submission grace period, and expiry release only after that grace period.
- Testnet deployment scripts explicitly target Testnet and do not create accounts or keys.
- Custody, settlement, Tidepool compatibility, proof requirements and release gates documented in docs/SETTLEMENT_ARCHITECTURE.md.

### Validation

- Latest successful push and PR workflows before the European maturity change passed Rust formatting, 18 Rust tests, Wasm release build, SDK build, 3 SDK tests, and offline lifecycle demo.
- The European maturity change was validated by the successful push and PR workflows at commit `b3e98329fdc3231713a4fe737ed5c58941a0e55b` (19 Rust tests, Wasm release build, SDK build, 3 SDK tests, offline lifecycle demo). The isolated escrow prototype is a new change and must pass its own workspace CI before it is considered validated.
- No mainnet deployment or real asset transfer has been performed.

### Escrow prototype added

- Added a separate `contracts/escrow` NEP-141 receiver contract for synthetic Testnet assets.
- Exact per-position writer collateral and holder exercise-payment deposits are checked against immutable token, sender, amount and time terms.
- Sequential payout callbacks track partial success; only a failed payout leg can be retried. This is not atomic settlement.
- Added escrow unit tests and workspace CI coverage. See `docs/ESCROW_TESTNET_PROTOTYPE.md`.
- The prototype is not connected to OptionsContract and is not ready for deployment; persistent storage, storage staking, integration and recovery review remain open.

## Remaining blockers

1. **Custody:** no per-position escrow/reservation currently holds collateral.
2. **Settlement:** two external transfers are not atomic; use a verified atomic verifier exchange or implement an enforceable escrow with explicit recovery/compensation.
3. **Proofs:** the trusted reconciler remains a trust root; no cryptographic remote-event verifier is implemented.
4. **Asset support:** exact Ondo token representations, decimals, verifier support and bridge routes must be verified.
5. **Storage:** assess replacing in-memory BTreeMap state with NEAR persistent collections before deployment.
6. **Testnet adapter:** optionally validate Tidepool using only its own test tokens; do not claim Ondo coverage.
7. **AI service:** keep deterministic fallback, add schema validation/audit records, and integrate a provider only after API access is available.
8. **UI integration:** wait for the user's existing UI; do not replace it.

## Current branch

work/testnet-backend-hardening, based on feat/handel-archive-core. Keep main untouched until the work is reviewed and the user approves a merge.
