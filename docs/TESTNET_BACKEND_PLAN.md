# Handel testnet backend plan

## Agreed scope

- NEAR contract development and demo target: NEAR Testnet only.
- No mainnet deployment, signing, custody, or real-fund operation.
- Backend first; defer the frontend until the user supplies their existing UI.
- Deterministic local AI proposal fallback now; add NEAR AI Cloud adapter later when the user has access.
- Never request or commit wallet secrets or API credentials.

## Intents boundary

The hackathon rules state that NEAR Intents has no testnet. A NEAR Testnet contract can demonstrate policy and lifecycle state, but Intents payloads must remain mock/illustrative. Do not claim live Intents settlement and do not initiate mainnet transactions.

## Implementation status

### Completed in the work branch

- Added explicit contract owner initialized from the initializer's predecessor account.
- Added `get_owner` and owner-authorized `transfer_ownership`.
- Admin checks now compare the caller with the stored owner.
- Added ownership initialization/transfer authorization unit test.
- Removed unused payable annotation from expiry release.
- Added GitHub Actions workflow for Rust formatting, Rust unit tests, Wasm build, SDK build, SDK tests, and offline lifecycle demo.
- Aligned TypeScript lifecycle states with Rust `PositionState` values.
- Replaced invalid SDK `create_position` argument builder with builders for actual Rust methods: `create_call`, `create_put`, and approval-gated `create_agent_proposal`.
- Updated offline lifecycle demo to use real method names and clearly label Intents payloads as mock.
- Added SDK unit tests for contract argument mapping and invalid-asset rejection.
- Added retry methods for failed exercise payment/delivery legs, guarded by the correct party and fresh operation IDs.
- Reconciliation now accepts the other in-flight exercise leg after a failure, checks that receipts refer to the current operation IDs, and derives settlement state from both current operation states.
- Added Rust tests for retry after one leg fails and for a late successful receipt after the position enters `ReconciliationRequired`.
- Added PowerShell and Bash deployment scripts that build from the repository root and explicitly target NEAR Testnet; they require an existing contract account and do not create keys/accounts.

### Not yet verified

- No successful CI result has been observed in this session.
- Rust formatting, unit tests, and Wasm build have not been run locally.
- SDK TypeScript build/tests have not been run locally.
- Do not claim any test passes until the workflow reports success.

## Remaining blockers

1. **Custody and settlement:** define where collateral is held, who can release it, and what constitutes independently authenticated transfer proof. Current trusted reconciler is a trust root, not a cryptographic verifier.
2. **Partial settlement recovery:** a successful exercise leg followed by a failed leg currently enters `ReconciliationRequired`; a reviewed retry/compensation/recovery path is still needed.
3. **Economic recovery:** retrying a failed leg does not compensate a transfer that has already irreversibly succeeded if the counterparty never completes the other leg. Define timeout, arbitration, refund/compensation, and user-disclosure rules.
4. **Asset metadata:** verify registry IDs and decimals at runtime/configuration boundaries; do not rely on hard-coded assumptions.
5. **Storage:** assess replacing in-memory `BTreeMap` state with NEAR persistent collections before deployment.
6. **Testnet deployment:** fix/review account setup and deployment workflow; only deploy after CI and security blockers are addressed.
7. **AI service:** keep deterministic fallback, add schema validation/audit records, and integrate a provider only after the user has API access.
8. **UI integration:** wait for the user's existing UI; do not replace it.

## Current branch

`work/testnet-backend-hardening`, based on `feat/handel-archive-core`. Keep `main` untouched until the work is reviewed and the user approves a merge.
