# Handel custody and settlement design

## 1. Current Testnet demo: simulation only

NEAR Intents has no Testnet environment under the hackathon rules. The current Testnet build must therefore be treated as a state-machine demonstration:

- No Ondo or USDC assets are transferred.
- SDK NEP-413 payloads are illustrative and must not be signed or submitted.
- The reconciliation evidence used in tests is synthetic.
- `CollateralLocked`, `Open`, and `Settled` represent simulated protocol states, not proof of real custody or delivery.
- The configured `trusted_reconciler` is an explicit trust root. The contract validates fields supplied by that account but does not independently verify an external chain event.

The UI and README must preserve these disclosures. Do not display a simulated state as a real token balance or completed cross-chain transfer.

## 2. Why the current receipt model is not production custody

The contract records expected sender, receiver, asset, and amount. It does not receive a NEP-141 token deposit, control an Intents internal balance, verify a Verifier event cryptographically, or prove that a transfer is final. A trusted service can currently submit a matching receipt-shaped object.

Consequently:

- A successful reconciliation is an assertion by the configured service, not a cryptographic proof.
- The contract cannot transfer an Intents internal balance back to a writer.
- The expiry-release operation currently models an external transfer; it is not an on-chain token transfer.
- A two-operation exercise is not atomic. One leg can complete while the other fails or never arrives.
- Retrying the failed leg helps recover from transient failures but does not reverse an irreversible first leg or guarantee the counterparty will complete settlement.

No real collateral should be accepted under this model.

## 3. Production architecture decision required

Before any mainnet or real-asset implementation, select and prove one custody model.

### Model A — NEAR-native token escrow

Use only if each supported asset is actually available as a NEP-141 token on NEAR and its transfer semantics are verified.

1. Writer deposits collateral to the options contract using the token contract's supported transfer-call flow.
2. The token contract calls `ft_on_transfer`; Handel validates the token contract, sender, amount, position, and expected asset.
3. Handel records the received amount as reserved collateral.
4. Holder premium and exercise legs are transferred using the same verified NEP-141 contracts.
5. The contract releases collateral only through token transfer calls after a valid state transition.
6. Storage, gas, promise callbacks, failed transfers, and re-entrancy/replay behavior are tested.

This model does not automatically support BSC-native Ondo tokens. A verified NEAR representation and bridge/Intents route are prerequisites.

### Model B — External Intents escrow with authenticated proofs

Use only if the selected Intents/verifier architecture provides a documented, independently verifiable receipt and a defined way to release or transfer the external balance.

1. User signs a narrowly scoped intent; Handel never receives the user's private key or seed phrase.
2. Intent includes a unique operation ID, chain/verifier context, asset, amount, sender, receiver, and expiry/nonce.
3. A proof verifier validates the canonical external event, correct verifier/contract, token identity, exact transfer fields, and finality/reorg policy.
4. Handel accepts only proof results bound to the exact pending operation; the proof cannot be replayed for another position or operation.
5. Settlement and expiry release use an explicitly authorized external mechanism. Do not assume a NEAR contract can move an Intents internal balance.
6. A reconciliation service may relay proof data, but must not be the sole authority unless the product explicitly accepts that custodial/trusted model and discloses it.

The official Intents and Chain Signatures interfaces must be checked against current documentation before choosing this model. This repository has not implemented or proven it.

## 4. Atomicity and partial settlement

A physical call/put exercise exchanges two assets. Two independent transfers are not atomic merely because the contract records both operation IDs.

Preferred order of solutions:

1. A single atomic settlement primitive that guarantees both transfers or neither.
2. A prefunded escrow with enforceable, contract-controlled release conditions.
3. If neither is available, a documented non-atomic protocol with timeouts, dispute handling, compensation/refund authority, and explicit user consent to counterparty risk.

A retry operation is not a substitute for compensation. The protocol must define what happens when one leg is final and the other leg cannot be completed.

## 4A. Recovery after collateral or premium failure

The Testnet state machine now exposes two narrowly authorized retry paths:

- `retry_collateral_lock`: writer-only; available only when the current collateral operation is definitively `Failed`. It creates a fresh operation ID and returns the position to pending collateral reconciliation.
- `retry_premium_payment`: holder-only; available only when the current premium operation is definitively `Failed` and the collateral operation is `Succeeded`. It creates a fresh operation ID and returns the position to pending premium reconciliation.

Both paths preserve the original operation record and reject reused operation IDs. They honor the contract pause flag because collateral/premium retries can advance a pending offer toward becoming open; unlike exercise-leg retries, they are blocked while paused. They do not provide a timeout-based retry, admin override, or automatic release. The reconciler must never label an unknown, delayed, or merely unobserved transfer as `Failed`; it must establish that the transfer did not occur. If the external transfer status is ambiguous, leave the operation pending and investigate rather than risk duplicate payment or collateral.

These methods improve lifecycle recoverability but do not establish custody, prove external transfers, or resolve one-sided exercise settlement.

## 5. Required proof fields and invariants

A future proof adapter must bind at least:

- Handel contract account and position ID
- unique operation ID and operation kind
- source chain/network and verifier identity
- token contract/address and canonical asset ID
- exact integer amount and decimals
- sender and receiver
- transaction hash and event/log index
- nonce/expiry and finality threshold
- proof format/version and verification result

Required invariants:

- No position becomes collateral-locked without independently verified receipt of the full required collateral.
- Reserved collateral cannot be withdrawn or reused.
- An operation ID can be consumed only once and only by its matching position/operation.
- No exercise is final until both required legs are verified under the selected atomicity model.
- A failed or disputed leg cannot silently release the successful leg's value.
- Pausing blocks new risk but must not prevent safe settlement recovery.
- AI output never authorizes transfers or bypasses contract policy.

## 6. Release gate

Do not move from Testnet simulation to real assets until the custody model, proof verification, finality/reorg handling, atomicity/compensation, storage model, and adversarial tests have been reviewed and demonstrated. Testnet success alone does not establish production safety.
