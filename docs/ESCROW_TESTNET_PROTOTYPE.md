# Handel escrow prototype (Testnet-only)

## Scope and status

This is a NEP-141 custody contract prototype exercised with synthetic mock tokens in NEAR Sandbox. OptionsContract now registers authoritative Call and Put terms asynchronously, persists the escrow ID through a private callback, and the combined Sandbox test deposits exact collateral through mock NEP-141 `ft_transfer_call` receipts. This is still not a Testnet deployment and does not use live Ondo assets. The combined Sandbox happy path now tests exercise-payment deposits and sequential payouts directly through Escrow, but does not synchronize settlement/expiry state back to OptionsContract. It must not be presented as production custody.

The escrow stores position records in NEAR's persistent `LookupMap`. Each record reserves the attached NEAR storage deposit; the current implementation retains the full attached amount and has no archival/refund path. The OptionsContract is still a separate contract. Its position, asset, operation, agent-policy, and proposal records now use NEAR persistent `UnorderedMap` collections; this does not itself provide a migration path for any already-deployed legacy state.

## Deposits and position terms

Only the configured controller can create a position. Each record binds the originating OptionsContract position ID, writer, holder, collateral token/amount, exercise-payment token/amount, and expiry. Registration is idempotent by source position ID: an exact retry returns the existing escrow ID without creating a second record; changed terms are rejected. Retry deposits are retained as additional storage reserve, so callers must budget for this rather than assume a refund. The writer deposits exact collateral using NEP-141 `ft_transfer_call`; after maturity, the holder deposits the exact exercise payment. The escrow validates token contract, sender, amount, position state, and time window. Rejected transfers are returned as unused.

The escrow's orientation supports both physical option directions when configured correctly:
- **Call:** writer collateral is the underlying token; holder exercise payment is USDC.
- **Put:** writer collateral is USDC; holder exercise payment is the underlying token.

OptionsContract derives terms from its stored OptionPosition, sends the source position ID and terms to escrow, and stores the returned escrow ID only in a private successful callback. The writer can retry an ambiguous registration; the escrow's idempotency guard prevents duplicate records. The callback only confirms registration, not token custody.

## Settlement behavior and limitations

After both deposits are received, the holder starts settlement. The escrow pays the exercise-payment asset to the writer first, then pays the collateral asset to the holder. This ordering is compatible with the call and put asset orientation above, but the two NEP-141 transfers are separate asynchronous operations, **not atomic**.

Each transfer has a private callback. A definitively failed leg can be retried without repeating a leg whose success was recorded. If payment succeeds but its callback receipt itself fails, state remains `PaymentPayoutPending`; an automatic retry is unsafe because the transfer may already have happened. This callback-failure case is covered by an isolated fault-injection Wasm Sandbox test. It does not provide a production recovery/reconciliation mechanism.

If no exercise payment is received, the writer may reclaim collateral only after maturity plus the 24-hour transaction-submission grace period. Expiry return is also asynchronous.

## Test coverage

The escrow unit and Sandbox suites cover:
- Exact token, sender, amount, state, and timing checks for deposits.
- Duplicate collateral and exercise-payment rejection.
- Maturity and expiry-grace boundaries.
- Payment-leg failure followed by retry, and collateral-leg failure followed by retry.
- Rejection of public callback replay.
- A test-only callback receipt panic after a successful payment transfer; the durable state remains pending and retry is blocked to avoid duplicate payout.
- A storage-gas benchmark for position creation at increasing record counts.

The isolated escrow tests validate mock-token custody and payout behavior. `options_registration.rs` deploys OptionsContract, Escrow, and two mock NEP-141 token contracts in Sandbox. It verifies Call and Put registration, callback persistence, authoritative term binding, exact collateral `ft_transfer_call` deposits, escrow state transitions to `CollateralLocked`, token balances held by escrow, and exclusion from the competing external-reconciliation rail. The combined-flow test now exercises both options after maturity: holder exercise-payment deposits, sequential writer-payment/collateral-delivery payouts, final escrow balances, and recipient balances. CI run #42508978797 passed on commit `1792d600`. Combined-flow failed registration, callback-receipt failure, retry after an ambiguous registration callback, and expiry return remain untested. Nothing here validates live Testnet tokens, Ondo assets, or atomic settlement.

## Required integration gates

Before connecting or deploying the two contracts:
1. Extend the combined Sandbox flow to cover failed escrow calls, callback receipt failure, and retry after an ambiguous callback.
2. Extend the combined flow with expiry return and state synchronization; exercise-payment deposits and both settlement payout legs are already covered by the passing combined test.
3. Define how OptionsContract lifecycle states map to escrow states. Do not mark collateral locked or a position settled based only on a requested cross-contract call; reconcile confirmed receipts and ambiguous callbacks.
4. Decide whether escrow is the sole custody/settlement path for a position or whether external-intent reconciliation remains enabled. Never allow both paths to settle the same economic leg.
5. Design and test recovery for the non-atomic two-transfer path. Retry only after a definitive failure; a missing callback is ambiguous, not proof of failure.
6. Test expiry return, partial payout, callback loss, and replay attempts in combined near-workspaces tests.
7. Review persistent `UnorderedMap` storage layout and migration for legacy state before any material-value deployment.
8. Review storage staking/refunds, NEP-145 registration, pause semantics, controller key security, and monitoring.

Do not deploy this prototype with real assets. Synthetic NEP-141 Testnet tokens only. No independent security audit, authenticated external-chain proof verifier, or production recovery procedure is claimed.
