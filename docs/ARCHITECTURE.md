# Architecture — Handel Options Core

## Current implementation: two separate execution rails

Handel currently contains two contract paths that are **not integrated**:

1. **OptionsContract (lifecycle and policy):** records option terms, agent permissions, operation IDs, and trusted-reconciler outcomes. It does not hold tokens.
2. **EscrowContract (isolated custody prototype):** holds synthetic NEP-141 Testnet collateral and exercise-payment deposits for its own independently numbered positions. It is not yet called by OptionsContract.

Do not describe the system as having end-to-end escrow custody until a cross-contract registration and lifecycle handshake is implemented and tested.

## OptionsContract rail (existing)

Users create a call or put offer. The writer starts collateral locking; a trusted reconciler reports the result of an external transfer. The holder pays premium; the holder may exercise at/after maturity within the 24-hour transaction-submission grace period. Exercise creates separate payment and delivery operations; both must reconcile successfully before the position is marked settled. Expiry release is also an external operation.

The reconciler checks caller, operation ID, asset, amount, sender, and receiver. It does not independently prove that an external verifier event occurred. The configured reconciler remains a trust root.

## EscrowContract rail (isolated prototype)

The escrow has persistent per-position records and accepts exact NEP-141 deposits:
- **Call:** writer deposits underlying collateral; holder deposits USDC exercise payment.
- **Put:** writer deposits USDC collateral; holder deposits underlying exercise payment.

After maturity and valid deposits, the escrow sends the exercise-payment asset to the writer and then the collateral asset to the holder. These are two asynchronous NEP-141 transfers, not an atomic exchange. Callback and retry state makes recorded partial success visible; it cannot reverse an irreversible transfer or safely infer success when a callback receipt is missing.

The escrow position ID is independent of the OptionsContract position ID. No authoritative binding currently exists between them.

## Required integration design

A safe integration needs an explicit asynchronous registration handshake:
1. OptionsContract derives the escrow terms from its stored OptionPosition, never from caller-supplied replacement terms.
2. OptionsContract calls escrow with the exact writer, holder, collateral asset/amount, payment asset/amount, expiry, and required storage deposit.
3. Escrow accepts registration only from the configured OptionsContract controller and returns its escrow position ID.
4. OptionsContract stores that ID only in a successful private callback. Failed or ambiguous callbacks must not be treated as a confirmed escrow registration.
5. Collateral-locked, exercised, settled, and expired states must be reconciled against escrow's durable state. The external-intent route and escrow route must not both be able to settle the same position.

The callback/receipt path must be tested for successful registration, failed registration, callback failure, duplicate requests, and ambiguous outcomes before enabling it.

## Agent path

1. User grants an agent hard limits (assets, size, premium, collateral, open count, expiry).
2. AI produces an AgentProposal JSON object.
3. Off-chain SDK validates the proposal.
4. The contract independently rechecks policy; the principal must approve the proposal before collateral lock starts.
5. User can revoke the agent.

AI output never overrides contract policy.

## Storage and deployment boundary

Escrow position records use NEAR's persistent `LookupMap`. OptionsContract currently uses standard-library `BTreeMap` collections inside contract state; this is not the desired scalable persistent-storage design and must be migrated with a state-migration plan before material-value deployment.

Testnet only. Synthetic tokens only. No claim of live Ondo asset support, official Intents Testnet settlement, atomic cross-asset settlement, authenticated external-chain proofs, or production readiness.
