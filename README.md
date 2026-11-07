# Handel

Handel is a NEAR Testnet backend prototype for fully collateralized European-style options on Ondo tokenized assets. It is a hackathon demonstration, not a production financial application or investment advice.

## Current scope

- Rust contract is the source of truth for option lifecycle, asset allowlists, agent limits, ownership, pause state, and reconciliation state.
- TypeScript SDK provides proposal validation, contract-compatible call builders, NEP-413 payload helpers, and an offline lifecycle demonstration.
- The deterministic local proposal fallback works without a paid AI API. A NEAR AI Cloud adapter can be added later; AI output never overrides contract policy.
- Frontend work is intentionally deferred until the user supplies their UI.
- Development and demo target: NEAR Testnet only. No mainnet deployment, signatures, custody, or real funds.

## Critical NEAR Intents limitation

The hackathon rules state that NEAR Intents has no testnet. Therefore this repository can demonstrate the contract lifecycle on NEAR Testnet, but its Intents payloads are illustrative/mock only. Do not describe the demo as live Intents settlement. The current reconciler is a trusted service boundary, not a cryptographic proof verifier.

## Build and test

Rust contract (run from repository root):

```sh
cargo fmt --all -- --check
cargo test --lib
cargo build --target wasm32-unknown-unknown --release
```

TypeScript SDK:

```sh
cd sdk
npm install
npm run build
npm test
npm run lifecycle
```

The offline lifecycle demo prints contract-compatible method names and argument shapes. It does not sign NEP-413 messages, submit transactions, or move assets.

## Testnet deployment preparation

A PowerShell deployment script is available at `scripts/deploy-testnet.ps1`; a Bash equivalent is at `scripts/deploy.sh`. Both require an existing dedicated `.testnet` contract account and that account's full-access key in the NEAR CLI keychain. They build from the repository root and explicitly select `network-config testnet`. They do not create accounts or keys. Do not run either script until CI passes and the custody/reconciliation design has been reviewed. The account that initializes the contract becomes its owner.

GitHub Actions runs Rust formatting, Rust unit tests, the Wasm build, SDK compilation, SDK unit tests, and the offline demo on pushes to `work/testnet-backend-hardening` and pull requests.

## Contract lifecycle

- Direct writer offers: `create_call` / `create_put`.
- Agent proposals: `create_agent_proposal`; the principal must approve using `approve_agent_proposal`.
- Collateral: `begin_collateral_lock`, then trusted-reconciler evidence through `reconcile_operation`. A definitively failed lock can be retried by the writer with `retry_collateral_lock`.
- Premium: `begin_premium_payment`, then reconciliation. A definitively failed payment can be retried by the holder with `retry_premium_payment`; collateral must already be confirmed.
- Agent policy: configure `max_collateral_usdc` as well as underlying and premium limits; put proposals are rejected when their strike collateral exceeds this cap.
- Exercise: `exercise` creates separate payment and delivery operations; both must reconcile successfully before `Settled`. If a leg fails, the relevant party can retry it with a fresh operation ID using `retry_exercise_payment` or `retry_exercise_delivery`; the other leg may still reconcile while the position is in `ReconciliationRequired`.
- Expiry: `request_expiry_release` creates an external release operation; this is not a native token transfer by the contract.

## Security and deployment boundary

See [`docs/CUSTODY_AND_SETTLEMENT.md`](docs/CUSTODY_AND_SETTLEMENT.md) for the explicit Testnet simulation boundary, custody models, partial-settlement risks, and release gates.

The contract checks reconciliation caller, operation ID, asset, amount, sender, and receiver. It does not independently prove that an external NEAR Intents or verifier event occurred. The configured reconciler is a trust root. Retryable exercise-leg recovery is implemented, but it does not solve economic compensation if one transfer is irreversible and the counter-transfer cannot be completed. Authenticated proof verification, custody authority, and finality/reorg handling remain unresolved. Do not use real assets or deploy for production.

The preceding PR commit passed GitHub Actions; every new code change must pass CI again before deployment. Do not deploy until the latest GitHub Actions checks pass and the custody/reconciliation design has been reviewed.

Never commit wallet seed phrases, private keys, API keys, or other credentials. Share only public account IDs in chat.
