# Day 2 implementation notes

This entry records code-level work only. No on-chain transfer or deployment is claimed.

- Added explicit `PendingCollateral`, `PendingCollateralReconciliation`, `CollateralLocked`, `PendingPremium`, `Open`, and `ReconciliationRequired` states.
- Collateral sizing uses full underlying for calls and full strike USDC for puts.
- Premium flow is available only to the named holder, after collateral reconciliation succeeds. `Open` is reached only on positive premium reconciliation.
- Operations have unique IDs, recorded requested asset/amount, pending and terminal states, query endpoint, and replay guard.
- Negative reconciliation leads to `ReconciliationRequired`, not a falsely open/settled position.
- `set_paused` is owner-only (the current prototype models owner as the contract account).
- NEP-413 signatures remain outside the contract. No secrets are accepted or persisted.

Security limitation: the current `reconcile_operation` is permissionless and takes a caller-supplied boolean. It is not proof of verifier execution. It must be replaced or protected by authenticated verifier/indexer verification before deployment. No tests currently exercise the lifecycle state transitions or replay resistance, so do not treat the current build as production-safe.

Toolchain/test evidence: Debian Rust `rustc 1.85.1` could not satisfy `near-sdk = 5.30.1`; stable Rust `1.99.1` was installed locally and compilation worked with `cargo test --lib` after enabling `near-sdk`'s `unit-testing` feature. That command passed with 0 tests present. Full doctests were not rerun after this compile correction. No `wasm32` target build or Tidepool interaction was completed.

Official AI setup reference: https://docs.near.ai/cloud/quickstart. Configure the API key yourself using the official service and store it only in a local or hosted secret manager. Never commit it or send it in chat. AI remains non-authoritative; contract policy checks must validate every proposal.
