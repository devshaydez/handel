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

GitHub Actions runs Rust formatting, Rust unit tests, the Wasm build, SDK compilation, SDK unit tests, and the offline demo on pushes to `work/testnet-backend-hardening` and pull requests.

## Contract lifecycle

- Direct writer offers: `create_call` / `create_put`.
- Agent proposals: `create_agent_proposal`; the principal must approve using `approve_agent_proposal`.
- Collateral: `begin_collateral_lock`, then trusted-reconciler evidence through `reconcile_operation`.
- Premium: `begin_premium_payment`, then reconciliation.
- Exercise: `exercise` creates separate payment and delivery operations; both must reconcile successfully before `Settled`.
- Expiry: `request_expiry_release` creates an external release operation; this is not a native token transfer by the contract.

## Security and deployment boundary

The contract checks reconciliation caller, operation ID, asset, amount, sender, and receiver. It does not independently prove that an external NEAR Intents or verifier event occurred. The configured reconciler is a trust root. Partial settlement recovery, authenticated proof verification, custody authority, and finality/reorg handling remain unresolved. Do not use real assets or deploy for production.

The contract has not yet been confirmed by a successful CI run in this work session. Do not deploy until the GitHub Actions checks pass and the custody/reconciliation design has been reviewed.

Never commit wallet seed phrases, private keys, API keys, or other credentials. Share only public account IDs in chat.
