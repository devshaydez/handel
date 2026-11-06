# handel

NEAR options prototype for Ondo tokenized assets, with NEAR Intents settlement planned. This is a testnet-only research implementation, not a production financial application. It is not legal, compliance or investment advice.

## Current verified status

The Rust contract has Day 1 foundation and a Day 2 lifecycle prototype in `src/lib.rs`. Run `cargo test --lib` and `cargo fmt -- --check` to check it locally. Compilation currently requires a recent Rust toolchain (NEAR SDK 5.30.1); it has been compiled with Rust 1.99.1 / Cargo 1.85.1 and the `unit-testing` feature.

The Day 2 contract records option offers, tracks pending collateral and premium operations, and transitions to `Open` only after a premium operation is reconciled successful. Calls require the full underlying quantity as collateral. Puts require the full strike amount in the configured USDC asset. Every operation has a unique ID and cannot be replayed; operations have explicit pending/succeeded/failed state and can be queried. `set_paused` is present as an owner-only emergency stop.

Important limitation: Path A assets move by user-signed NEP-413 intents outside this contract. The current reconciliation method is permissionless and accepts a caller-provided success flag and external reference. It is only a prototype; it is not authenticated to Tidepool's verifier or a trusted indexer, and therefore does not safely prove actual collateral or premium receipt. Do not deploy this contract or use it to custody funds until reconciliation is authenticated, access control is audited, and the lifecycle and adversarial tests pass. The implementation does not yet provide withdrawals, settlement/exercise, the asset allow-list/decimals registry, agent policies, or frontend. These remain in scope in later sprint days, not dropped.

## Testnet and signed intents

The sprint plan names Tidepool's verifier as `verifier.tidepool-sandbox.testnet` and explicitly notes that Tidepool test tokens are not Ondo stock. An end-to-end user-signed transfer requires a user's full-access NEAR testnet key in a local wallet or secure secret store, and user authorization at the time of signing. Never paste a seed phrase, private key, wallet export, or NEAR AI API key in chat. No Tidepool NEP-413 transfer has been signed or executed from this build session; no wallet signing credential was available, so there is no transaction hash to claim.

## NEAR AI Cloud setup

AI integration is future scope. Create an API key through the official NEAR AI Cloud interface and store it locally as a secret (for example, an ignored `.env` file or your deployment platform's secret manager). Do not commit the key or send it in chat. Use the official quickstart for endpoint and SDK details: https://docs.near.ai/cloud/quickstart

AI output must remain an untrusted proposal. Contract-side risk and policy checks must remain authoritative.

## Day 1 evidence

Day 1 token-list snapshots, asset IDs, and dry-quote request/response records are stored under `evidence/` and at the repository root. Tidepool reachability and contract deployment were not established in this build session.

## Known limitations / next work

- Implement authenticated verifier/indexer reconciliation and secure operation authorization.
- Add NEP-413 sign-and-submit client path; users sign locally with their own full-access wallet key. Function-call keys cannot authorize NEP-413 intents.
- Add full physical settlement, expiry/exercise, withdrawals that respect locked collateral, and adversarial tests.
- Add verified asset registry with decimals, pause unsupported assets, and prevent user-controlled arbitrary asset IDs.
- Implement revocable agent limits and proposal validation, then a minimal UI and step-by-step judge path.
- Record every testnet transaction and hash, then refresh exact deployment/build evidence.

No testnet deployment, push, real-fund action, or third-party signing was performed in this update.