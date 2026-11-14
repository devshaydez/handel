# Handel — European Options Protocol on NEAR

Handel is a fully collateralized European options protocol on NEAR, designed for tokenized stocks such as NVDAon and TSLAon. An AI agent can help create options, but only inside limits the owner sets on-chain, enforced on-chain.

## What works today

- **Testnet deployments:** OptionsContract Wasm is deployed and hash-matched (E-002); Escrow Wasm deployment is recorded, but its deployment transaction did not initialize it (E-003).
- **Call/Put lifecycle coverage:** contract tests cover collateral, premium, exercise and expiry gates; a Sandbox test covers Call/Put registration, mock-token deposits and sequential settlement.
- **Policy-bounded agent creation:** implemented and tested in source. The audited deployed state has no registered agent policy and is in ManualApproval mode (E-009).
- **Separate transfer authority:** the principal signs collateral; the holder signs premium. The agent does not sign either transfer.

## How an option works

1. **Create — writer signs.** The writer calls `create_call` or `create_put`; OptionsContract records `PendingCollateral`.
2. **Register — writer or restricted agent initiates.** `register_escrow_position` (or `agent_register_escrow_position`) makes OptionsContract call Escrow's `create_position_v2`.
3. **Lock collateral — writer signs.** The writer sends the exact NEP-141 collateral with `ft_transfer_call`; Escrow's `ft_on_transfer` checks token, sender and amount.
4. **Pay premium — holder signs.** The holder sends the premium with `ft_transfer_call`, then calls `settle_premium`; Escrow records payment only after the payout callback succeeds.
5. **Exercise — holder signs.** At or after expiry, the holder sends the exercise payment with `ft_transfer_call` and calls `settle_exercise`. Escrow pays the writer, then transfers collateral to the holder in a second, asynchronous transfer.
6. **Expire — writer calls.** If the holder does not exercise, the writer calls `release_expired_collateral` after the 24-hour exercise grace period. Any received but unpaid premium must be refunded first.

## How the counterparty is protected

- **(a) Can a position become active or exercisable before collateral is confirmed locked?** No. OptionsContract starts at `PendingCollateral`, advances to `CollateralLocked` only after successful reconciliation, and reaches `Open` only after premium reconciliation. Escrow starts at `AwaitingCollateral`; only an exact writer deposit changes it to `CollateralLocked`. Exercise payment is rejected until collateral is received and required premium is paid. Tests: `call_collateral_is_full_underlying_and_lifecycle_requires_both_receipts`, `failed_collateral_does_not_advance_to_locked`, `accepts_only_exact_writer_collateral_from_registered_token`.
- **(b) What if the holder never pays premium?** Escrow rejects exercise payment unless premium is marked paid. If no premium was received, the writer can reclaim collateral after expiry plus the 24-hour grace period. If premium was received but not paid out, the holder must complete the refund path before collateral release. Tests: `premium_requires_exact_holder_token_amount_and_must_be_paid_before_exercise`, `expired_collateral_release_succeeds_after_grace_period`, `definitively_failed_premium_payout_can_be_refunded_after_grace`. The exact never-paid-premium expiry branch is present in `release_expired_collateral`; no dedicated test for that precise branch is claimed.
- **(c) What if the holder does not exercise?** The writer cannot release during the grace period. After it, Escrow returns collateral to the writer and marks the position expired, subject to any required premium refund. Tests: `writer_cannot_release_expired_collateral_during_exercise_grace`, `expired_collateral_cannot_be_released_during_grace_period`, `expired_collateral_release_succeeds_after_grace_period`.
- **(d) What depends on trusted actors?** On the OptionsContract rail, the configured trusted reconciler reports collateral, premium, exercise and expiry transfer outcomes; the contract checks the operation, asset, amount and parties but cannot prove the external transfer itself. The owner configures the reconciler and contract settings. In Escrow, the owner configures the controller and payout reconciler; the controller registers positions. Ambiguous payout/refund outcomes can be resolved by the trusted payout reconciler. Tests: `untrusted_caller_cannot_reconcile_success`, `evidence_with_wrong_amount_or_asset_is_rejected`, `trusted_evidence_resolves_ambiguous_payment_without_repeating_that_leg`, `escrow_admin_handoffs_require_acceptance_by_the_proposed_account`.

The OptionsContract and Escrow are separate rails today: Escrow lifecycle state is not yet fully synchronized back into OptionsContract, and the two exercise payout legs are not atomic. See [Architecture](docs/ARCHITECTURE.md) and [E-008](docs/EVIDENCE.md#e-008--trust-and-settlement-boundary).

## The AI agent (a feature, not the product)

- The configured signer is a restricted FunctionCall key for exactly four OptionsContract methods, with a finite allowance; FullAccess keys are refused.
- The contract re-checks principal, enabled state, mode, expiry, asset and numeric limits on delegated entrypoints.
- Only the principal can revoke its agent through `revoke_agent`.
- The agent never transfers funds; principal collateral and holder premium remain separate wallet-signed transfers.
- Decision records are append-only and hash-chained; altered records and broken chains fail verification.

## Demo links

- Demo video: https://x.com/shayy_xn/status/2121721458607198523
- X post: https://x.com/shayy_xn/status/2121721458607198523
- Live app: https://handel-live.vercel.app — E-007 records READY deployment commit `12c8222ab639cce05ee01ea27bae43a2e95f8eb0`; it is behind main.
- Repo: https://github.com/devshaydez/handel

## Judge in 60 seconds

1. Read this pitch and the [protocol limits](#boundaries).
2. Run the [no-secret quickstart](#quickstart-no-secrets).
3. Open the [policy and lifecycle tests](#claim--proof).
4. Open [docs/EVIDENCE.md](docs/EVIDENCE.md) and distinguish source tests from live Testnet evidence.

## Claim -> Proof

| Claim | File, test or evidence |
|---|---|
| OptionsContract Testnet deployment and exact Wasm hash match | [E-002](docs/EVIDENCE.md#e-002--optionscontract-testnet-deployment-and-exact-wasm-match) |
| Escrow Testnet deployment transaction (deploy-only; initialization not proven) | [E-003](docs/EVIDENCE.md#e-003--escrow-testnet-deployment) |
| Collateral and premium gates before OptionsContract reaches Open | [src/lib.rs](src/lib.rs): `call_collateral_is_full_underlying_and_lifecycle_requires_both_receipts`, `failed_collateral_does_not_advance_to_locked` |
| Exact collateral, premium, exercise and expiry rules in Escrow | [contracts/escrow/src/lib.rs](contracts/escrow/src/lib.rs): `ft_on_transfer`, `settle_exercise`, `release_expired_collateral`; tests in [Escrow source tests](contracts/escrow/src/lib.rs) |
| Call/Put registration, mock-token deposits and Sandbox settlement | [options_registration.rs](contracts/escrow/tests/options_registration.rs): `call_and_put_registration_deposit_and_settle_through_escrow`; [E-005](docs/EVIDENCE.md#e-005--offline-lifecycle-and-sandbox) |
| Four-method FunctionCall scope, finite allowance and FullAccess rejection | [near-function-call-signer.ts](sdk/src/near-function-call-signer.ts), [near-function-call-signer.test.ts](sdk/src/near-function-call-signer.test.ts) |
| Contract policy limits and principal-only revocation | [src/lib.rs](src/lib.rs): `agent_policy_limits_principal_and_revoke_are_enforced`, `agent_proposal_rejects_policy_limit_breaches_and_revocation` |
| Principal collateral and holder premium are separately wallet-authorized | [TestnetProposalComposer.tsx](frontend/src/components/TestnetProposalComposer.tsx), [E-006](docs/EVIDENCE.md#e-006--delegated-agent-implementation) |
| Decision records are hash-chained and tamper-checked | [decision-journal.ts](sdk/src/decision-journal.ts), [decision-journal.test.ts](sdk/src/decision-journal.test.ts) |
| SDK Chat path enables E2EE/OHTTP and verifies pinned deployment evidence and response signatures | [nearai-provider.ts](sdk/src/nearai-provider.ts), [nearai-stack.ts](sdk/src/nearai-stack.ts), [nearai-provider.test.ts](sdk/src/nearai-provider.test.ts) |
| Historical CI jobs passed on the recorded commit; not proof of a live trade | [E-001](docs/EVIDENCE.md#e-001--latest-main-ci) |

## Tracks

### Unstoppable DeFi

Handel's primary track is options infrastructure: a European Call/Put state machine, explicit writer and holder roles, collateral gates, exercise windows and expiry handling. The AI agent is an optional way to create a policy-bounded option; it is not the protocol's trust or custody layer.

- **Lifecycle state:** OptionsContract separates pending collateral, locked collateral, pending premium, open, settlement and expiry states in [src/lib.rs](src/lib.rs).
- **Position custody prototype:** Escrow records per-position NEP-141 token, amount, writer and holder; `ft_on_transfer` rejects wrong senders, tokens, amounts and timing in [contracts/escrow/src/lib.rs](contracts/escrow/src/lib.rs).
- **Exercise and expiry:** Escrow requires collateral and exercise payment before sequential payout; expiry release is writer-only and delayed through the grace period. See [payout tests](contracts/escrow/src/lib.rs) and [Sandbox integration](contracts/escrow/tests/options_registration.rs).
- **Failure handling:** callbacks preserve partial payout state; retries target a definitively failed leg and do not repeat a successful leg. See [payout_flows.rs](contracts/escrow/tests/payout_flows.rs).

**Honest limit:** no cross-chain NEAR Intents settlement; contract-owner and trusted-reconciler trust remain; the current custody implementation is a NEP-141 escrow prototype, not NEP-245 Intents custody.

### AI Security & Defense

- Delegated execution is restricted to four contract methods, a finite key allowance and on-chain policy checks; see [signer tests](sdk/src/near-function-call-signer.test.ts) and [policy tests](src/lib.rs).
- System One screens allow/block/review decisions separately from execution; its tests reject unsafe or unverified outcomes in [nearai-systemone.test.ts](sdk/src/nearai-systemone.test.ts).

**Honest limit:** source tests do not establish a clean deployed agent account; E-009 records no active policy, ManualApproval mode and a separate FullAccess key on that account.

### Privacy & Private AI

- **SDK path only:** Chat enables field-level E2EE and Gateway OHTTP; Gateway/model signer identities and TEE measurements are pinned, and response signatures are verified. See [nearai-provider.ts](sdk/src/nearai-provider.ts) and [nearai-provider.test.ts](sdk/src/nearai-provider.test.ts).
- **SDK path only:** System One uses a separate Gateway-signature policy; it is not represented as model TEE attestation. See [nearai-stack.ts](sdk/src/nearai-stack.ts) and [nearai-systemone.test.ts](sdk/src/nearai-systemone.test.ts).

**Honest limit:** the hosted API client in [lib/handel-api.js](lib/handel-api.js) sets `e2ee: false`; no hosted-app E2EE/OHTTP claim is made. TEE evidence does not prove model-output correctness.

### Agent Economy

- The agent can prepare and submit policy-bounded Call/Put creation and Escrow registration; the principal still funds collateral and the holder still pays premium. See [agent-execution.ts](sdk/src/agent-execution.ts) and [agent-execution.test.ts](sdk/src/agent-execution.test.ts).
- The decision journal records proposal terms, evidence, guardrail and policy results in an append-only hash chain. See [decision-journal.ts](sdk/src/decision-journal.ts).

**Honest limit:** the premium is a fixed demo fixture; the audited Testnet agent policy is not active, and no live two-party funding lifecycle is recorded.

## Roadmap (planned, not built)

- **Ondo route:** verify exact Ondo asset IDs, decimals, quotes and supported execution route — [docs/ONDO_NEAR_INTENTS_ROUTE.md](docs/ONDO_NEAR_INTENTS_ROUTE.md).
- **NEP-245 custody:** implement Intents custody and per-position collateral reservation — [docs/SETTLEMENT_ARCHITECTURE.md](docs/SETTLEMENT_ARCHITECTURE.md).
- **Trust and governance:** replace the trusted reconciler with verifiable settlement proof, and replace single-owner control with multisig and timelock — [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md), [docs/SETTLEMENT_ARCHITECTURE.md](docs/SETTLEMENT_ARCHITECTURE.md).
- **Market and launch gates:** add a live pricing feed, complete an independent audit, then consider capped Mainnet deployment — [docs/MARKET_DATA_AND_PRICING_GATES.md](docs/MARKET_DATA_AND_PRICING_GATES.md), [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md).

Sustainability model: a protocol fee on premium is proposed, not implemented.

## Quickstart (no secrets)

**Node.js 24.22.1+ required.** Run from the repository root; no API key, wallet, Rust toolchain or Testnet funds are needed.

```bash
npm --prefix sdk ci
npm --prefix sdk run build
npm --prefix sdk test
npm --prefix sdk run lifecycle
```

## Optional full proof

Requires `NEARAI_API_KEY`; it runs NEAR AI checks, SDK preparation and local NEAR Sandbox contracts with mock NEP-141 assets. It does not submit a live Ondo or Intents settlement.

```bash
# Linux, macOS or WSL
./scripts/run-e2e-proof-demo.sh

# Windows PowerShell
.\scripts\run-e2e-proof-demo.ps1
```

## Architecture

```text
Writer wallet ── create_call / create_put ──> OptionsContract
                                                  │
                              register_escrow_position
                                                  │
                                                  v
                                           NEP-141 Escrow
                                            ▲         ▲
                          writer signs collateral   holder signs premium
                                            │         │
                                            └── exercise payment / payout
```

### How the agent is constrained

1. The principal sets asset, size, premium, collateral, expiry and open-position limits on-chain.
2. The restricted key targets OptionsContract only, with four methods and a finite allowance.
3. SDK preflight and contract entrypoints check policy; registration re-checks current policy.
4. The agent can create/register an option but cannot call token contracts or move funds.
5. Only the principal can revoke its agent through `revoke_agent`.

## Boundaries

- **Network:** Testnet only.
- **Assets and pricing:** synthetic Tidepool test assets in the current composer; fixed demo premium.
- **Settlement:** no live Ondo or cross-chain NEAR Intents settlement; current escrow is a NEP-141 prototype.
- **Lifecycle:** no recorded completed live two-party funding/settlement lifecycle (E-006); OptionsContract and Escrow are not yet fully synchronized.
- **Authority:** trusted reconciler and single contract owner remain trust assumptions; no multisig/timelock.
- **Deployment:** E-009 reports no registered agent policy, ManualApproval mode and a separate FullAccess key on the audited agent account. The SDK refuses FullAccess for the configured delegated signer.
- **Collateral claim:** full exact collateral is enforced in the tested contract paths; this is not evidence of production custody or live Ondo collateral reservation.
