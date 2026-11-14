# Handel — European Options Protocol on NEAR

Handel brings collateralized European Call and Put options to NEAR, with an optional AI agent that creates positions under owner-defined on-chain policy.

## What it is

Handel is an options protocol first. Writers create Calls or Puts with defined collateral, premium, expiry and exercise terms; holders pay the premium and can exercise within the contract's exercise window. The protocol separates option lifecycle logic from token movement through an OptionsContract and a NEP-141 Escrow.

The AI agent is an execution feature: it can prepare and initiate permitted option creation, while wallet-authorized parties retain control of collateral and premium transfers.

## What works today

- **Options lifecycle:** Call/Put creation, collateral and premium gates, exercise and expiry paths are implemented in the contracts and covered by unit tests.
- **Escrow mechanics:** per-position NEP-141 collateral registration, exact-token/amount checks, premium handling, exercise and expiry paths are implemented and exercised in Sandbox tests with mock tokens.
- **Testnet deployments:** OptionsContract Wasm is deployed and its retrieved code hash matches the recorded artifact. Escrow deployment is recorded. See [E-002](docs/EVIDENCE.md#e-002--optionscontract-testnet-deployment) and [E-003](docs/EVIDENCE.md#e-003--escrow-testnet-deployment).
- **Agent controls:** delegated entrypoints enforce principal policy in contract code; the SDK restricts its signer to four methods with a finite allowance and rejects FullAccess signers.
- **Read-only Testnet verification:** two independent RPC providers agreed on deployed code hashes and audited contract/token state. Tidepool asset verification and dry-quote checks also run in CI.
- **Build and test coverage:** the latest completed all-jobs CI run passed Rust formatting/unit/Sandbox/Wasm, SDK build/tests, frontend typecheck/build, Testnet read-only checks and the AI-to-Sandbox proof. See [E-001](docs/EVIDENCE.md#e-001--ci-and-automated-verification).

## How an option works

1. **Create — writer signs.** The writer calls `create_call` or `create_put`; OptionsContract records `PendingCollateral`.
2. **Register — writer or restricted agent initiates.** `register_escrow_position` (or `agent_register_escrow_position`) asks Escrow to create the position.
3. **Lock collateral — writer signs.** The writer sends the exact NEP-141 collateral with `ft_transfer_call`; Escrow checks the token, sender and amount.
4. **Pay premium — holder signs.** The holder sends the premium with `ft_transfer_call` and calls `settle_premium`; Escrow records payment after the payout callback succeeds.
5. **Exercise — holder signs.** During the exercise window, the holder sends the exercise payment and calls `settle_exercise`. Escrow pays the writer and transfers collateral to the holder in a second transfer.
6. **Expire — writer calls.** If the holder does not exercise, the writer can call `release_expired_collateral` after the 24-hour exercise grace period, subject to any required premium refund.

## The AI agent (feature)

- **On-chain policy:** delegated calls re-check the principal, enabled state, execution mode, expiry, asset and numeric limits.
- **Restricted authority:** the SDK accepts a FunctionCall key scoped to four OptionsContract methods with a finite allowance; it refuses FullAccess keys.
- **Principal control:** only the principal can revoke its agent through `revoke_agent`.
- **No fund-moving authority:** the agent can create/register an option, but collateral and premium transfers require separate wallet signatures from the principal and holder.

## Claim → Proof

| Claim | Proof |
|---|---|
| OptionsContract deployed to NEAR Testnet; retrieved Wasm matches artifact | [Deployment transaction and hash, E-002](docs/EVIDENCE.md#e-002--optionscontract-testnet-deployment) |
| Escrow Wasm deployment recorded | [Deployment transaction, E-003](docs/EVIDENCE.md#e-003--escrow-testnet-deployment) |
| Collateral and premium gates protect the OptionsContract lifecycle | [Contract tests](src/lib.rs): `call_collateral_is_full_underlying_and_lifecycle_requires_both_receipts`, `failed_collateral_does_not_advance_to_locked` |
| Escrow validates deposits and covers Call/Put flows in Sandbox | [Escrow tests](contracts/escrow/tests/options_registration.rs), [E-005](docs/EVIDENCE.md#e-005--offline-and-sandbox-lifecycle-tests) |
| Delegated signer is method-scoped and rejects FullAccess | [Signer implementation and tests](sdk/src/near-function-call-signer.ts), [tests](sdk/src/near-function-call-signer.test.ts) |
| Contract policy limits and principal revocation are enforced in source tests | [Policy tests](src/lib.rs): `agent_policy_limits_principal_and_revoke_are_enforced`, `agent_proposal_rejects_policy_limit_breaches_and_revocation` |
| CI covers contracts, SDK, frontend, Testnet checks and AI-to-Sandbox proof | [Completed run #906, E-001](docs/EVIDENCE.md#e-001--ci-and-automated-verification) |
| Deployed Testnet code and state were checked against two RPCs | [Dual-RPC audit, E-009](docs/EVIDENCE.md#e-009--dual-rpc-audit-of-deployed-testnet-state) |

## Tracks

### Unstoppable DeFi — primary

Handel builds composable options infrastructure for NEAR: explicit writer/holder roles, Call/Put lifecycle states, collateral requirements, premium handling, exercise windows and expiry. The agent is optional; the protocol is the product.

### Agent Economy / AI Security — secondary

The agent can initiate policy-bounded option creation through a restricted key. On-chain checks, finite signer authority and principal revocation keep delegated execution subordinate to wallet ownership.

## Quickstart

**Node.js 24.22.1+ required.** Run from the repository root. This local SDK demo needs no API key, wallet, Rust toolchain or Testnet funds.

```bash
npm --prefix sdk ci
npm --prefix sdk run build
npm --prefix sdk test
npm --prefix sdk run lifecycle
```

## Boundaries

- **Network:** NEAR Testnet; no Mainnet deployment.
- **Assets:** current executable flows use synthetic Tidepool test assets, not Ondo stock tokens.
- **Funding:** no recorded completed live two-party collateral-and-premium funding lifecycle.
- **Agent deployment:** the audited Testnet account had no active policy, was in `ManualApproval` mode and retained a FullAccess key.
- **Settlement:** no live NEAR Intents/NEP-245 custody, Ondo settlement or demonstrated per-position Intents collateral reservation.
- **Pricing:** the demo premium is fixed; production market pricing is not connected.

## Demo links

- **Demo video:** https://x.com/shayy_xn/status/2121721458607198523
- **X post:** https://x.com/shayy_xn/status/2121721458607198523
- **Live app:** https://handel-live.vercel.app
- **Repository:** https://github.com/devshaydez/handel

For the full evidence ledger and technical trust/settlement analysis, see [docs/EVIDENCE.md](docs/EVIDENCE.md) and [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md).
