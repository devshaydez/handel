# Handel Testnet backend plan

## Agreed scope

- NEAR Testnet only; no mainnet, real-asset custody, or real-fund operation.
- Backend first; integrate the user's existing UI when supplied.
- Deterministic local AI proposal fallback now; provider adapter only when API access is available.
- Never request or commit wallet secrets or API credentials.

## Current implementation status

### OptionsContract

- Owner authorization, pause state, asset allowlist, agent policies, proposal approval, operation IDs, retry paths, and European maturity/grace-period checks are implemented.
- External asset movements are represented as operations and reconciled by a configured trusted account.
- The trusted reconciler is a trust root: the contract validates evidence fields but does not independently verify the external transfer.
- Contract records now use NEAR persistent `UnorderedMap` collections. Any already-deployed legacy state still needs a reviewed migration plan before material-value deployment.

### Isolated EscrowContract

- Separate NEP-141 custody prototype for synthetic Testnet assets.
- Per-position records use NEAR persistent `LookupMap`; each registration requires an attached storage deposit, retained by the contract.
- Exact token, sender, amount, state, and time checks for writer collateral and holder exercise payment.
- Call/put orientation is supported by configuring the collateral/payment token pair appropriately.
- Sequential two-leg payout callbacks, definitive-failure retry handling, expiry release, and callback-failure fault-injection coverage.
- Storage-gas benchmark for position creation.
- OptionsContract calls escrow asynchronously to register authoritative Call/Put terms and stores the returned escrow ID in a private callback. Escrow maps the source OptionsContract ID to one idempotent record. A combined Sandbox test deploys both contracts and mock NEP-141 tokens, verifies Call/Put registration, exact collateral and exercise-payment deposits, sequential settlement payouts, final balances, and competing-rail exclusion. CI run #42508978797 passed on commit `1792d600`. This is not Testnet deployment or live-token custody. Combined expiry, registration failure/callback recovery, and authoritative OptionsContract lifecycle synchronization remain unintegrated.

### CI

The preceding feature-branch work passed the Rust formatting, Rust/Sandbox tests, Wasm build, SDK build/tests, and offline lifecycle workflow. Every new change must pass fresh CI; historical success does not validate new commits.

## Critical remaining blockers

1. **Cross-contract integration:** combined Sandbox coverage now verifies successful Call/Put registration, authoritative terms, private callback persistence, mock NEP-141 collateral deposits, escrow balances/state, and exclusion from the competing reconciliation rail. Add failed registration, callback-receipt failure, and ambiguous-retry coverage.
2. **Lifecycle mapping:** integrate holder exercise-payment deposits, both payout legs, expiry return, and state reconciliation across both contracts. Prevent the external-intent path and escrow path from settling the same position.
3. **Ambiguous callbacks:** a missing callback is not proof that a transfer failed. Do not automatically retry an ambiguous payout.
4. **Non-atomic settlement:** escrow pays two NEP-141 legs sequentially. Design and test recovery/compensation for partial success; do not claim atomicity.
5. **OptionsContract storage:** review persistent UnorderedMap storage layout and any legacy-state migration strategy.
6. **Token operations:** test NEP-145 registration, storage funding, recipient registration, pause behavior, and failure handling.
7. **Proofs and trust:** no cryptographic external-event verifier or finality/reorg handling is implemented.
8. **Assets:** verify exact token contracts, decimals, and route support. Current synthetic mocks do not establish Ondo support.
9. **UI:** integrate the user's existing UI when provided; do not replace it.

## Validation labels

Report these separately:
- **Implemented:** source code exists.
- **Sandbox-tested:** relevant near-workspaces test passed.
- **Testnet-deployed:** contract deployed to NEAR Testnet.
- **Testnet-verified:** real Testnet transaction and resulting state/balances inspected.

Never promote one label to another. Never commit secrets. Keep `main` untouched until the user explicitly approves a merge.
