# Handel escrow prototype (Testnet-only)

## Scope and status

This is an isolated NEP-141 custody prototype for synthetic Testnet tokens. It is not connected to the existing OptionsContract until an explicit integration step. It does not support the BNB-chain Ondo assets and must never be presented as production custody.

The escrow is a separate deployable contract crate at `contracts/escrow`. The configured OptionsContract controller creates immutable per-position records. Writers deposit exact collateral using NEP-141 `ft_transfer_call`; holders deposit the exact exercise payment after maturity. The escrow validates the calling token contract, sender, amount, position and time window before accepting either deposit.

## Settlement behavior

The escrow pays the holder's exercise payment to the writer first, then pays collateral to the holder. These are two separate NEP-141 `ft_transfer` calls, not one atomic transaction. Each call has a private callback. If the first payout fails, it can be retried without duplicating a successful leg. If the second payout fails after the first succeeded, the position remains in `ReconciliationRequired`; only the failed collateral leg can be retried. A successful leg is never sent again.

If no exercise payment is received, the writer may reclaim collateral only after maturity plus the 24-hour transaction-submission grace period. Expiry return also uses an asynchronous transfer and callback.

## Implemented checks and current unit-test coverage

- Only the configured OptionsContract controller can register positions.
- Each position binds writer, holder, collateral token, collateral amount, payment token, payment amount and expiry.
- NEP-141 receiver accepts only the exact token contract, expected sender, exact amount and valid state.
- Duplicate deposits and wrong-token/wrong-sender/wrong-amount deposits are rejected by returning the full amount as unused.
- Exercise payment is accepted only from the holder at/after maturity and through the grace deadline; the acceptance timestamp is stored so a holder can finish settlement after the grace period has elapsed.
- Expiry release is blocked during the exercise grace period.
- Outbound transfers use fixed recipients and amounts; retries are restricted to the one failed payout leg.

The 8 escrow unit tests currently cover exact/wrong-token collateral, wrong sender and amount, duplicate collateral, pre-maturity exercise-payment rejection, valid maturity payment, late collateral rejection, grace-period expiry-release blocking, exercise-payment replay rejection, and completion of an already-accepted exercise while paused and after the grace deadline. The callback failure/retry branches are implemented but are **not yet covered by end-to-end cross-contract tests**.

## Explicit limitations / integration gates

- Test only with synthetic NEP-141 tokens. No production assets, Ondo identifiers, or mainnet.
- The escrow uses in-memory maps for this isolated prototype. Persistent storage collections, storage staking, and state migration must be implemented before any deployment with material value.
- The OptionsContract controller is a trust boundary. The current OptionsContract does not yet call this escrow or prove its position terms.
- Two outgoing transfers are not atomic. The callbacks and retry state make partial success visible and recoverable, but cannot guarantee the counterparty's economic cooperation or reverse a completed transfer.
- Callback failure/retry behavior still needs near-workspaces integration tests against a mock NEP-141 token, including successful first-leg/failed second-leg, failed first-leg, callback replay and token-account registration errors. A callback that itself runs out of gas could leave a payout marked pending; operational monitoring and a separately reviewed recovery procedure are required.
- Token accounts must have registered the escrow and the fixed payout recipients under NEP-145 before transfers can succeed.
- Pause blocks new deposits and new position registration. It does not block failed-payout retries or expiry refunds, and it does not trap an exercise payment already accepted during the valid window: that exercise can still enter settlement while paused or after the grace deadline.
- The prototype does not yet implement NEP-245 multi-token deposits, cryptographic external-chain proofs, Tidepool, or an Ondo bridge.

Do not deploy this contract until the test suite and Wasm build pass, persistent storage and recovery behavior are reviewed, and a separate integration review verifies controller authorization and the exact synthetic-token setup.
