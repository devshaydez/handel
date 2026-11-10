# Day 2 implementation notes

This entry records code-level work only. No on-chain transfer or deployment is claimed.

- Added explicit `PendingCollateral`, `PendingCollateralReconciliation`, `CollateralLocked`, `PendingPremium`, `Open`, and `ReconciliationRequired` states.
- Collateral sizing uses full underlying for calls and full strike USDC for puts.
- Premium flow is available only to the named holder, after collateral reconciliation succeeds. `Open` is reached only on positive premium reconciliation.
- Operations have unique IDs, recorded requested asset/amount, pending and terminal states, query endpoint, and replay guard.
- Negative reconciliation leads to `ReconciliationRequired`, not a falsely open/settled position.
- `set_paused` is owner-only (the current prototype models owner as the contract account).
- NEP-413 signatures remain outside the contract. No secrets are accepted or persisted.

Security limitation: `reconcile_operation` is restricted to the configured trusted service and validates receipt fields against the recorded operation. It does not cryptographically prove the external verifier event; the service remains a trust root. The test suite covers the local lifecycle and reconciliation boundary but does not establish external transfer authenticity or production safety.

Toolchain/test evidence: Debian Rust `rustc 1.85.1` could not satisfy `near-sdk = 5.30.1`; stable Rust `1.99.1` was installed locally and compilation worked with `cargo test --lib` after enabling `near-sdk`'s `unit-testing` feature. The latest local run passed 11 tests. Full doctests, Wasm target build, live Tidepool verification, and deployment were not completed.

Path B remains the target, but no Chain Signatures MPC integration or signed NEP-413 transaction has been completed. The available official-doc retrieval was incomplete, so payload details were not guessed. No signing credential or AI provider key was accessed. See `README.md` and `evidence/backend-continuation.md` for the current boundary and remaining scope.
