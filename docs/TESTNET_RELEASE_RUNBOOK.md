# Testnet deployment and release runbook

**Status:** preparation only. No deployment is authorized or claimed by this document.  
**Network:** NEAR Testnet only.  
**Release posture:** prototype / synthetic assets only; not production custody and not safe for real assets.

## 1. What is actually deployable

The repository builds three Wasm contracts in CI: OptionsContract, Escrow, and mock-ft. Separate safe-by-default Bash and PowerShell helpers now deploy the OptionsContract artifact (`target/near/handel_options.wasm`) and Escrow artifact (`target/near/handel_escrow/handel_escrow.wasm`). Neither helper deploys mock-ft, registers tokens, provisions storage, creates accounts, configures a verifier, or connects a frontend.

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

    bash scripts/deploy.sh <options-account.testnet> --confirm-testnet-deployment

PowerShell:

    ./scripts/deploy-testnet.ps1 -ContractAccount <options-account.testnet> -ConfirmTestnetDeployment

These commands deploy without calling the initializer. For a **brand-new account with no prior contract state only**, initialization is a separate explicit choice:

    bash scripts/deploy.sh <options-account.testnet> --confirm-testnet-deployment --initialize

    ./scripts/deploy-testnet.ps1 -ContractAccount <options-account.testnet> -ConfirmTestnetDeployment -Initialize

Never use the initializer on an account that may already contain contract state. The helper requires an existing .testnet account and a key available through the local NEAR CLI keychain. It does not create accounts or keys. It prints the artifact hash and targets Testnet explicitly. It does not deploy Escrow or mock-ft.

Escrow Bash:\n\n    bash scripts/deploy-escrow-testnet.sh <escrow-account.testnet> --confirm-testnet-deployment\n\nEscrow PowerShell:\n\n    ./scripts/deploy-escrow-testnet.ps1 -ContractAccount <escrow-account.testnet> -ConfirmTestnetDeployment\n\nFor a **brand-new Escrow account only**, append `--initialize` or `-Initialize` to invoke `new`. The Escrow initializer sets its owner to the transaction predecessor. Do not initialize an account that may contain prior contract state.\n\nBefore running any command, independently verify the target account and exact candidate commit/artifact. A successful CLI command is not proof that the deployed contract has the expected state or that token custody/settlement works.

## 5. Tidepool Testnet asset profile

The provider's live `GET https://www.usetidepool.tech/v0/tokens` registry was observed on 2026-11-09. The six NEAR-side NEP-141 test tokens and their asset IDs, token accounts, and decimals are snapshotted in `config/testnet-assets.tidepool.json`. Re-fetch the live registry immediately before use; this file is a dated record, not a source of permanent truth.

For the initial valueless lifecycle test, the proposed pair is:
- Exercise payment and premium: `nep141:usdc.tidepool-sandbox.testnet`, token account `usdc.tidepool-sandbox.testnet`, 6 decimals.
- Candidate Call underlying: `nep141:wnear.tidepool-sandbox.testnet`, token account `wnear.tidepool-sandbox.testnet`, 24 decimals. Keep disabled until its metadata, code hash, owner/minter, and NEP-145 storage behavior are independently checked.

**Important identity difference:** the default mainnet Intents USDC asset ID in OptionsContract is `nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1`. Tidepool Testnet USDC uses a different ID. The OptionsContract now supports an owner-only `set_usdc_asset_id` setting, which accepts only an already-enabled six-decimal asset. For a fresh Testnet deployment, register the Tidepool USDC asset first with `set_asset`, then set it with `set_usdc_asset_id`, and bind its NEP-141 account with `set_escrow_token_account`. Do not use the production identifier against the Tidepool Testnet token.

Provider-published metadata is not independent on-chain verification. The repository now includes `node scripts/verify-testnet-assets.mjs`, which re-fetches the live registry and checks all six NEP-141 contracts through FastNEAR and dRPC Testnet RPC endpoints at finality. The deprecated public `rpc.testnet.near.org` endpoint returned HTTP 429 in CI, so it is intentionally not used. It compares `ft_metadata`, `owner_id`, `is_minter`, deployed code hashes, `storage_balance_bounds`, and provider-account `storage_balance_of` results across the two RPCs. The script is read-only and is wired into CI. CI also checks Tidepool `/v0/health` against the documented Defuse v0.4.5 verifier WASM SHA-256 and requires its on-chain verifier/RPC health checks to pass. It then requests a live Tidepool dry quote for 1 USDC to wNEAR (`dry: true`), verifies the quote's raw base-unit amounts and maker signature, and asserts that no deposit address is created. These are read-only identity/API smoke tests; they do not sign, deposit, execute, or prove Ondo liquidity. To additionally inspect the intended Escrow account after its ID is provisioned, run it with `HANDEL_ESCROW_ACCOUNT=<escrow-account.testnet>`. A CI pass without that variable does not prove the Handel Escrow account is registered. NEP-145 registration and storage funding require a separate approved transaction; none is performed by this script or deployment helpers.

## 5A. NEAR Intents verifier target for Testnet

The Testnet execution target is `verifier.tidepool-sandbox.testnet`. Tidepool documents this as the official NEAR Intents/Defuse v0.4.5 verifier deployed unmodified on NEAR Testnet. Its `/v0/health` endpoint re-checks the deployed code hash. The SDK execution helper therefore requires an explicit verifier account and exports `TIDEPOOL_TESTNET_VERIFIER`; it must not silently default to Mainnet's `intents.near`.

Use explicitly configured Testnet RPC endpoints for read-only simulation and finality checks. Settlement evidence acceptance must use `QuorumNearRpcReceiptInspector` with at least two distinct RPC endpoint origins operated independently; it rejects any disagreement. A quorum of RPC views reduces single-provider dependence but is not a cryptographic light client or proof of remote-chain settlement. Never point the Testnet wallet flow at `intents.near`. Before enabling a live synthetic transaction, verify the verifier code hash and ABI, register the wallet public key where required, and verify the exact NEP-413 recipient, signer, nonce, deadline and intent payload. A successful simulation alone does not prove settlement; independently inspect the final transaction, receipts and resulting NEP-245 balances.

Tidepool's 1Click-compatible API base is `https://www.usetidepool.tech`. It does not require a partner JWT for Testnet quote/deposit/status flows; any non-empty API-key/Bearer value merely selects its lower test fee tier. Wallet-authenticated `/v0/account/*` calls use a Tidepool-issued session token created by signing with the user's own wallet; that token is not the production partner JWT. The production 1Click partner JWT is a later Mainnet integration gate and must remain server-side.

Tidepool is community-operated, custodial at deposit-address creation, and has one maker. It is Testnet-only, publicly settles swaps, and does not prove Ondo stock-token support. Do not send real assets or treat Tidepool results as Mainnet/production guarantees. See [Tidepool verifier architecture](https://www.usetidepool.tech/docs/concepts/how-it-works), [quickstart](https://www.usetidepool.tech/docs/quickstart), and [compatibility limits](https://www.usetidepool.tech/docs/resources/compatibility).

## 6. Escrow and OptionsContract authority configuration\n\nPerform this only after both contracts have been deployed and independently verified, using the intended Testnet account IDs. Use the owner account for each owner-only call and retain every transaction hash.\n\n1. The Escrow owner calls `propose_controller` on Escrow with the exact OptionsContract account ID.\n2. The OptionsContract owner calls `set_escrow_contract` on OptionsContract with the exact Escrow account ID.\n3. The OptionsContract owner calls `accept_escrow_controller` on OptionsContract. This makes the cross-contract call from OptionsContract itself so Escrow can authenticate the proposed controller. Verify Escrow's controller view afterwards.\n4. The OptionsContract owner enables each explicitly approved asset with `set_asset(asset_id, decimals, true)`, then binds its NEP-141 contract with `set_escrow_token_account(asset_id, token_account)`. Do not infer IDs or decimals from symbols; verify the exact Testnet token contract and metadata independently first.\n5. The OptionsContract owner configures `set_trusted_reconciler` only after the reconciler's authority, evidence source, operational ownership, and key policy have been reviewed. This is a trust-root assignment, not cryptographic proof verification.\n6. The Escrow owner proposes the payout reconciler with `propose_payout_reconciler`; the selected reconciler account must separately call `accept_payout_reconciler`. Verify the resulting reconciler view.\n\nDo not create positions or transfer tokens during configuration. Do not treat controller configuration as proof that collateral is reserved or that external settlement is verified.\n\n## 7. Post-deployment verification — mandatory

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

## 8. Release gates still open

- [ ] Dedicated OptionsContract and Escrow Testnet accounts and key policy.
- [x] Escrow Testnet deployment helpers (Bash/PowerShell), deterministic artifact selection, explicit confirmation, deploy-only default, and opt-in initializer are implemented and CI-tested.\n- [ ] Escrow deployment and owner/controller/reconciler configuration are executed and independently verified on Testnet.
- [ ] Persistent-state migration/redeployment decision; no upgrade against unknown legacy state.
- [x] Provider-published Tidepool Testnet token IDs, token accounts, and decimals snapshotted in `config/testnet-assets.tidepool.json`; OptionsContract USDC asset identity is now configurable without changing its serialized root state.\n- [ ] Pass the dual-RPC live asset-verification CI job; then re-run with `HANDEL_ESCROW_ACCOUNT` set after the dedicated Escrow account exists and independently review its NEP-145 balance. Approve any storage registration/funding separately.
- [ ] Independently verified settlement event/proof source; trusted reconciler assumption reviewed.
- [ ] Enforceable per-position collateral reservation and custody authority.
- [ ] End-to-end deployed premium, exercise, expiry, payout retry, ambiguous reconciliation, and replay tests.
- [ ] Independent RPC/receipt verification and captured transaction evidence.
- [ ] Monitoring, alert delivery, incident response, key compromise and rollback runbooks.
- [ ] Independent security review of contract, callback, storage, authority, and settlement boundaries.
- [ ] Explicit release approval by the project owner.

Passing CI or deploying a Wasm file does not close any of these gates. Mainnet and real-asset use remain prohibited by the current architecture and evidence.

## 9. Evidence record template

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


### Read-only quote smoke-test rate limits

The Tidepool dry-quote smoke test retries transient upstream failures. Tidepool may wrap an upstream HTTP 429 as HTTP 500 with a message containing `429`. After bounded retries, that specific rate-limit condition is reported as `INCONCLUSIVE` (not `PASS`): CI remains usable, but the run does not claim a live quote was verified. Other HTTP errors and malformed quote responses remain hard failures. Asset-registry and verifier checks are reported independently.


## 10. Settlement RPC quorum requirement

The single-endpoint `NearRpcReceiptInspector` is for tests and controlled diagnostics only. Production settlement evidence must be constructed with `QuorumNearRpcReceiptInspector` and at least two distinct RPC providers. The inspector now requires the returned transaction hash and signer ID to match the requested transaction, then binds the exact verifier receipt and settlement event. Duplicate matching events are rejected. RPC agreement is corroboration, not a consensus/light-client proof; the configured verifier's authority and event correctness still require independent review.
