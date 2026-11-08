# Handel escrow prototype (Testnet-only)

## Scope and status

This is a NEP-141 custody contract for synthetic Testnet tokens. OptionsContract now has an explicit asynchronous registration call and private callback that can create and persist the matching escrow position ID. This is registration-only integration: it does not deposit collateral, settle an option, or connect the external-reconciliation lifecycle. It does not support the BNB-chain Ondo assets and must not be presented as production custody.

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

These tests validate the isolated escrow contract and its mock-token behavior. The registration callback has been implemented in OptionsContract, but a cross-contract Sandbox test is still required. Nothing here validates live Testnet tokens, Ondo assets, or atomic settlement.

## Required integration gates

Before connecting or deploying the two contracts:
1. Add an explicit OptionsContract-to-escrow registration handshake. The escrow must accept position terms only from the configured OptionsContract, and OptionsContract must persist the returned escrow position ID only after a successful callback.
2. Bind every escrow field to the authoritative OptionPosition: writer, holder, collateral token/amount, payment token/amount, expiry, and call/put asset orientation. Reject mismatches and duplicate registration.
3. Define how the OptionsContract lifecycle maps to escrow states. Do not mark collateral locked or a position settled based solely on a requested cross-contract call; use confirmed receipts and handle callback failure as an ambiguous state.
4. Decide whether escrow is the sole custody/settlement path for a position or whether the existing external-intent reconciliation path remains enabled. Never allow both paths to settle the same economic leg.
5. Design and test compensation/recovery for the non-atomic two-transfer path. A retry is permitted only after a definitive failure; a missing callback is ambiguous, not proof of failure.
6. Review the persistent `UnorderedMap` storage layout and define a state-migration plan for any already-deployed legacy state before material-value deployment.
7. Review storage staking/refunds, NEP-145 registration, pause semantics, controller key security, and monitoring.
8. Run end-to-end near-workspaces tests for calls and puts, successful and failed cross-contract registration, duplicate registration, callback failure, partial settlement, expiry, and replay attempts.

Do not deploy this prototype with real assets. Synthetic NEP-141 Testnet tokens only. No independent security audit, authenticated external-chain proof verifier, or production recovery procedure is claimed.
