# Architecture — Handel Options Core

## Current implementation: two separate execution rails

Handel currently contains two contract paths with **registration-only integration**:

1. **OptionsContract (lifecycle and policy):** records option terms, agent permissions, operation IDs, and trusted-reconciler outcomes. It does not hold tokens.
2. **EscrowContract (isolated custody prototype):** holds synthetic NEP-141 Testnet collateral and exercise-payment deposits. OptionsContract can now register a corresponding record asynchronously and persist the returned escrow ID, but token deposits and lifecycle settlement are not yet wired back to OptionsContract.

Do not describe the system as having end-to-end escrow custody: only the registration handshake is implemented; collateral transfer, settlement, expiry, and lifecycle reconciliation remain separate.

## OptionsContract rail (existing)

Users create a call or put offer. The writer starts collateral locking; a trusted reconciler reports the result of an external transfer. The holder pays premium; the holder may exercise at/after maturity within the 24-hour transaction-submission grace period. Exercise creates separate payment and delivery operations; both must reconcile successfully before the position is marked settled. Expiry release is also an external operation.

The reconciler checks caller, operation ID, asset, amount, sender, and receiver. It does not independently prove that an external verifier event occurred. The configured reconciler remains a trust root.

## EscrowContract rail (isolated prototype)

The escrow has persistent per-position records and accepts exact NEP-141 deposits:
- **Call:** writer deposits underlying collateral; holder deposits USDC exercise payment.
- **Put:** writer deposits USDC collateral; holder deposits underlying exercise payment.

After maturity and valid deposits, the escrow sends the exercise-payment asset to the writer and then the collateral asset to the holder. These are two asynchronous NEP-141 transfers, not an atomic exchange. Callback and retry state makes recorded partial success visible; it cannot reverse an irreversible transfer or safely infer success when a callback receipt is missing.

The escrow records the originating OptionsContract position ID and makes registration retries idempotent. OptionsContract now stores the returned escrow ID after a successful private callback and allows a writer to retry an ambiguous registration. No complete authoritative cross-contract lifecycle binding exists yet.

## Required integration design

A safe integration needs an explicit asynchronous registration handshake:
1. OptionsContract derives the escrow terms from its stored OptionPosition, never from caller-supplied replacement terms.
2. OptionsContract calls escrow with the exact writer, holder, collateral asset/amount, payment asset/amount, expiry, and required storage deposit.
3. Escrow accepts registration only from the configured OptionsContract controller and returns its escrow position ID.
4. OptionsContract stores that ID only in a successful private callback. Failed or ambiguous callbacks must not be treated as a confirmed escrow registration.
5. Collateral-locked, exercised, settled, and expired states must be reconciled against escrow's durable state. The external-intent route and escrow route must not both be able to settle the same position.

The successful registration path is now covered by `contracts/escrow/tests/options_registration.rs`. Failed registration, callback receipt failure, ambiguous retry, and duplicate cross-contract requests still need combined Sandbox coverage before enabling custody or settlement.

## Agent path

1. User grants an agent hard limits (assets, size, premium, collateral, open count, expiry).
2. AI produces an AgentProposal JSON object.
3. Off-chain SDK validates the proposal.
4. The contract independently rechecks policy; the principal must approve the proposal before collateral lock starts.
5. User can revoke the agent.

AI output never overrides contract policy.

## Storage and deployment boundary

Escrow position records use NEAR's persistent `LookupMap`. OptionsContract records now use NEAR persistent `UnorderedMap` collections. Any already-deployed legacy state still needs a reviewed migration plan before material-value deployment.

Testnet only. Synthetic tokens only. No claim of live Ondo asset support, official Intents Testnet settlement, atomic cross-asset settlement, authenticated external-chain proofs, or production readiness.
