# Handel custody and settlement boundary

The detailed architecture decision, Testnet options, escrow design, atomicity analysis, maturity rules and release gates now live in [SETTLEMENT_ARCHITECTURE.md](./SETTLEMENT_ARCHITECTURE.md).

## Current contract status: simulation only

The current OptionsContract is a policy and lifecycle state machine, not an asset custodian.

- It has no NEP-141 ft_on_transfer or NEP-245 mt_on_transfer deposit handler.
- It does not control NEAR Intents internal balances.
- It does not independently verify external-chain transactions or verifier events.
- reconcile_operation accepts receipt-shaped evidence from one configured trusted account.
- request_expiry_release creates an external operation record; it does not transfer tokens.
- The operation ledger's success states are synthetic in the current Testnet/offline demo.

No real collateral should be accepted under this model.

## Reconciliation trust boundary

A successful reconciliation currently means only that the configured trusted reconciler submitted fields matching the pending operation. It is not cryptographic proof. The service must not report a transfer as failed if the status is unknown, delayed or merely unobserved; doing so could permit a duplicate transfer during retry.

A future real adapter should prefer:
1. a token callback handled directly by the custody contract;
2. a NEAR contract-to-contract verifier call with a callback recording its actual execution result;
3. an independently verified remote-chain proof/light-client path;
4. a trusted relayer only as an explicitly disclosed trust assumption.

## Recovery after collateral or premium failure

The Testnet state machine exposes:
- retry_collateral_lock: writer-only, after a definitively failed collateral operation;
- retry_premium_payment: holder-only, after a definitively failed premium operation and confirmed collateral.

Both use fresh operation IDs, preserve the original operation record, reject replay, and respect the pause flag. They do not authorize timeout-based retries or automatic release.

Exercise payment/delivery retries are also party-restricted and use fresh IDs. They help recover from transient failures but do not reverse an irreversible successful leg or guarantee compensation if the other leg never completes.

## European exercise window

Exercise is blocked before maturity. The holder can submit exercise from expiry_ns through a 24-hour transaction-submission grace period. Writer expiry release is blocked until that grace period has elapsed. This corrects the earlier early-exercise behavior. The grace period is an operational submission window, not American-style early exercise.

## Release gate

Do not deploy for real assets until the architecture in [SETTLEMENT_ARCHITECTURE.md](./SETTLEMENT_ARCHITECTURE.md) is implemented and independently reviewed. In particular, exact asset support, enforceable per-position collateral reservation, proof authenticity, atomic settlement or a consented compensation model, persistent storage and adversarial failure tests remain required.
