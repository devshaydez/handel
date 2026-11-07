# Handel testnet backend plan

## Agreed scope

- NEAR contract development and deployment target: NEAR Testnet only.
- No mainnet deployment, signing, custody, or real-fund operation.
- Backend-first. The frontend/UI is intentionally deferred until the user supplies their existing UI for integration.
- AI proposals must work immediately through a deterministic local fallback. A NEAR AI Cloud provider adapter can be added later without making the provider authoritative.
- Never commit wallet keys, seed phrases, private keys, or API credentials.

## Important Intents boundary

The hackathon's supplied rules state that NEAR Intents has no testnet and that Intents integration is mainnet-only. Therefore a NEAR Testnet contract demo can prove contract lifecycle and policy enforcement, but it cannot honestly be described as a live NEAR Intents settlement demo. Keep the Intents boundary behind an adapter and use a clearly labelled mock/reconciliation harness for testnet. Do not request mainnet credentials or initiate a mainnet transaction.

## Implementation sequence

1. Contract foundations: explicit deployer ownership, secure admin configuration, initialization, storage/state model, and tests.
2. Custody and settlement model: document who holds each asset, what transfer path is authoritative, proof/finality assumptions, partial-failure recovery, and withdrawal rules before implementing value movement.
3. SDK alignment: make TypeScript types, method names, operation IDs, and lifecycle states match the Rust contract.
4. Backend services: deterministic AI proposal fallback, strict schema validation, policy evaluation, audit trail, operation tracking, and reconciliation adapter.
5. Adversarial testing: unauthorized callers, replay, wrong asset/amount/recipient, pause/revocation, expiry, duplicate receipts, partial settlement, and failed transfer recovery.
6. Testnet release: reproducible build/deploy/call instructions, public testnet contract address and transaction evidence after the user creates and controls a testnet account.

## Current work branch

work/testnet-backend-hardening, based on feat/handel-archive-core.

## Current verified changes

- Contract now stores the initializer's predecessor account as owner.
- Added get_owner and owner-authorized transfer_ownership.
- Admin checks compare against stored owner rather than the contract account itself.
- Unit test added for initialization, unauthorized admin calls, and ownership transfer.
- Removed the unused payable annotation from expiry release.

## Not yet verified

The GitHub edits have not been compiled or tested in a local Rust/NEAR toolchain in this session. Do not deploy until cargo fmt -- --check, cargo test --lib, and a Wasm build pass. The custody/reconciliation architecture remains a blocker before any real asset transfer.
