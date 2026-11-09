# Testnet deployment and release runbook

**Status:** preparation only. No deployment is authorized or claimed by this document.  
**Network:** NEAR Testnet only.  
**Release posture:** prototype / synthetic assets only; not production custody and not safe for real assets.

## 1. What is actually deployable

The repository builds three Wasm contracts in CI: OptionsContract, Escrow, and mock-ft. The deployment helpers in this repository deploy **only** the OptionsContract artifact (target/near/handel_options.wasm). They do not deploy or configure Escrow, register tokens, provision storage, create accounts, configure a verifier, or connect a frontend.

The current OptionsContract is a policy/lifecycle state machine. It does not receive collateral through NEP-141, does not prove remote settlement, and accepts reconciliation assertions from a configured trusted account. Escrow payout legs are asynchronous and non-atomic. Do not accept real assets or describe a position as fully collateralized/settled based only on these contracts or a successful deployment.

## 2. Required inputs — not present in this repository

Before any Testnet deployment, an operator must provision and independently record:

- Dedicated OptionsContract and Escrow .testnet account IDs.
- A reviewed account-key policy, including who controls full-access keys and how compromise/rotation is handled.
- A deployment operator with near-cli-rs, Rust, cargo-near 0.22.x, and access to the relevant account key in the local NEAR CLI keychain.
- Exact contract source commit, CI run URL, Wasm artifact SHA-256, and intended network/account mapping.
- A decision on fresh deployment versus upgrade, including persistent-state compatibility. **No migration is implemented or implied.**
- Exact Testnet token contract IDs, decimals, registration requirements, and storage-deposit amounts for each contract and payout recipient.
- A verifier/reconciler trust decision and operational contact. The current reconciler is a trust root, not a cryptographic verifier.
- A rollback/recovery plan and independent reviewer sign-off.

Do not put private keys, seed phrases, API keys, or keychain exports in the repository, CI logs, or chat. Never use a Mainnet account or network-config mainnet.

## 3. Build and artifact identity

Run the complete CI workflow against the exact candidate commit. CI must pass Rust formatting, unit tests, all optimized Wasm builds, callback-failure Wasm builds, Sandbox/workspace integration tests, SDK build/tests, and the offline demo.

Build the OptionsContract artifact from the repository root:

    cargo near build non-reproducible-wasm --no-abi
    sha256sum target/near/handel_options.wasm

The deployment helper intentionally refuses to select an arbitrary *.wasm from the workspace. Escrow and mock-ft require their own separately reviewed deployment/configuration procedure; they must not be substituted for OptionsContract.

Record the full commit SHA, CI run ID/URL, artifact SHA-256, build toolchain versions, target account IDs, and operator.

## 4. Deployment helper safety

Bash:

    ./scripts/deploy.sh <options-account.testnet> --confirm-testnet-deployment

PowerShell:

    ./scripts/deploy-testnet.ps1 -ContractAccount <options-account.testnet> -ConfirmTestnetDeployment

These commands deploy without calling the initializer. For a **brand-new account with no prior contract state only**, initialization is a separate explicit choice:

    ./scripts/deploy.sh <options-account.testnet> --confirm-testnet-deployment --initialize

    ./scripts/deploy-testnet.ps1 -ContractAccount <options-account.testnet> -ConfirmTestnetDeployment -Initialize

Never use the initializer on an account that may already contain contract state. The helper requires an existing .testnet account and a key available through the local NEAR CLI keychain. It does not create accounts or keys. It prints the artifact hash and targets Testnet explicitly. It does not deploy Escrow or mock-ft.

Before running either command, independently verify the target account and the exact candidate commit/artifact. A successful CLI command is not proof that the deployed contract has the expected state or that token custody/settlement works.

## 5. Post-deployment verification — mandatory

For each deployed contract:

1. Query account and contract code state through an independently selected NEAR RPC source.
2. Verify the deployed code hash against the recorded Wasm artifact and transaction receipt.
3. Verify initializer state, owner, controller, payout reconciler, pause state, and all configured account IDs.
4. Inspect the deployment and initialization transaction receipts and all generated receipts.
5. Verify the contract exposes the expected version/method surface; capture exact block height/hash and RPC endpoint.
6. Verify storage balance and NEP-145 registration for every token account and payout recipient before any token transfer.
7. Run only synthetic-token tests with small, bounded amounts. Capture transaction hashes, receipt IDs, event logs, resulting contract state, and before/after token balances.
8. Test duplicate/replay rejection, callback failure, payout partial failure, expiry, and ambiguous outcomes. Unknown outcomes must remain pending; do not retry on timeout or missing indexer data.
9. Have a second reviewer independently inspect the evidence and reconcile contract state with token balances.

No live asset/settlement claim is permitted until the exact route, asset identity, reservation/custody mechanism, and proof authenticity are demonstrated. Tidepool is community-operated and does not currently prove support for Handel's Ondo token identifiers.

## 6. Release gates still open

- [ ] Dedicated OptionsContract and Escrow Testnet accounts and key policy.
- [ ] Escrow deployment helper and explicit initialization/configuration procedure.
- [ ] Persistent-state migration/redeployment decision; no upgrade against unknown legacy state.
- [ ] Exact supported Testnet token IDs/decimals and NEP-145 registration/storage funding.
- [ ] Independently verified settlement event/proof source; trusted reconciler assumption reviewed.
- [ ] Enforceable per-position collateral reservation and custody authority.
- [ ] End-to-end deployed premium, exercise, expiry, payout retry, ambiguous reconciliation, and replay tests.
- [ ] Independent RPC/receipt verification and captured transaction evidence.
- [ ] Monitoring, alert delivery, incident response, key compromise and rollback runbooks.
- [ ] Independent security review of contract, callback, storage, authority, and settlement boundaries.
- [ ] Explicit release approval by the project owner.

Passing CI or deploying a Wasm file does not close any of these gates. Mainnet and real-asset use remain prohibited by the current architecture and evidence.

## 7. Evidence record template

For each deployment/test, record:

| Field | Value |
|---|---|
| Source commit | |
| CI run URL and conclusion | |
| Contract account | |
| Network | NEAR Testnet |
| Wasm SHA-256 | |
| Deployment transaction hash | |
| Initialization transaction hash (if applicable) | |
| Deployed code hash | |
| Block height/hash | |
| RPC source/operator | |
| Token IDs and decimals | |
| NEP-145 storage registration evidence | |
| Test operation IDs and transaction hashes | |
| Receipt IDs / event indices | |
| Before/after balances | |
| Independent reviewer | |
| Open discrepancies | |
