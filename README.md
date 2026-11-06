# handel

NEAR options backend prototype for Ondo tokenized assets, targeting Path B: Chain Signatures to NEP-413 intents. Backend only. This is research/testnet code, not a production financial application or investment advice.

## Verified implementation status

The Rust contract models option offers, collateral and premium operations, reconciliation states, exercise payment and delivery, and principal-scoped revocable agent policies. Call collateral is the full underlying amount; put collateral is the strike amount in configured USDC. Exercise records separate payment and delivery operations and reaches `Settled` only after both succeed, in either receipt order. Agent-created offers are attributed to the principal and checked against the principal's deterministic on-chain policy.

Run `cargo fmt -- --check` and `cargo test --lib`. The test suite covers operation replay, wrong asset/amount evidence, unauthorized reconciliation, collateral failure, call/put amounts, holder-only exercise, expiry, dual-leg settlement order/failure, agent limits, and principal-only revocation.

## Reconciliation security boundary

`reconcile_operation` rejects callers other than `trusted_reconciler` and checks a receipt's unique operation ID, asset, amount, sender, receiver, and transfer reference. The contract does **not** cryptographically verify a Tidepool verifier event or NEAR Intents receipt. The configured reconciler is a trust root, and receipt semantics, finality, and independent verification remain external responsibilities. Therefore this prototype is not yet a cryptographically trustless or deployable financial system. Do not deploy or custody funds until an authenticated proof path is implemented, reviewed, and tested.

## Path B status

Target architecture: user authorizes an intent through a NEP-413 signed message; the user retains control of the signing credential. A Chain Signatures service or contract coordinates the cross-chain signature only after on-chain policy authorization. It must not receive user secrets. Prototype code must bind chain, verifier, asset, amount, sender, receiver, operation ID, nonce, and expiry, and be replay-protected. The current code has not integrated the official Chain Signatures MPC interface or produced a signed NEP-413 intent. Official docs are the required source before implementing protocol-specific payloads; the latest docs retrieval in this session was incomplete. No signature credential or AI API key is available or stored.

## AI proposal boundary

AI may suggest option parameters only. The contract's agent policy is authoritative for allowed assets, underlying amount, premium amount, open-position count, and policy expiry. An AI provider key must be supplied and stored by the user in a local ignored secret file or secret manager, never in chat or Git. No provider call or AI API key is configured in this prototype.

## Day 1 evidence

Existing dry-quote request/response records are stored under `evidence/day1-dry-quotes.json`. They are historical Path A dry-quote observations, not executable signed intents. Tidepool reachability and contract deployment were not established.

## Remaining backend work

- Replace trusted-service receipt assertions with authenticated verifier evidence or verifiable proof and define finality/reorg behavior.
- Finish Path B integration against current official Chain Signatures and NEP-413 interfaces, plus an isolated test harness with no secrets or real funds.
- Add verified asset registry and decimals, explicit withdraw/cancel/expiry handling, complete physical settlement recovery paths, and adversarial tests.
- Implement AI provider adapter/schema validation and proposal audit trail while retaining deterministic contract policy as final authority.
- Document reproducible testnet setup and evidence after a user-controlled secure credential is configured.

No frontend work is included. No deployment, signing, or real-fund operation occurred.
