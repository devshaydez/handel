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

### Not yet verified

- No successful CI result has been observed in this session.
- Rust formatting, unit tests, and Wasm build have not been run locally.
- SDK TypeScript build/tests have not been run locally.
- Do not claim any test passes until the workflow reports success.

## Remaining blockers

1. **Custody and settlement:** define where collateral is held, who can release it, and what constitutes independently authenticated transfer proof. Current trusted reconciler is a trust root, not a cryptographic verifier.
2. **Partial settlement recovery:** a successful exercise leg followed by a failed leg currently enters `ReconciliationRequired`; a reviewed retry/compensation/recovery path is still needed.
3. **Asset metadata:** verify registry IDs and decimals at runtime/configuration boundaries; do not rely on hard-coded assumptions.
4. **Storage:** assess replacing in-memory `BTreeMap` state with NEAR persistent collections before deployment.
5. **Testnet deployment:** fix/review account setup and deployment workflow; only deploy after CI and security blockers are addressed.
6. **AI service:** keep deterministic fallback, add schema validation/audit records, and integrate a provider only after the user has API access.
7. **UI integration:** wait for the user's existing UI; do not replace it.

## Current branch

`work/testnet-backend-hardening`, based on `feat/handel-archive-core`. Keep `main` untouched until the work is reviewed and the user approves a merge.
