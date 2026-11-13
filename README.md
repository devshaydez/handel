# Handel

An AI agent that can trade options on NEAR but provably cannot exceed on-chain limits or touch anyone's funds.

The principal sets the policy; delegated contract calls enforce it.
The principal and holder retain their own transfer signatures.
The principal can revoke the agent directly on-chain.

## Judge in 60 seconds

1. Read the three-line pitch above.
2. Run the [no-secret quickstart](#quickstart-no-secrets).
3. Open the [threat model](docs/THREAT_MODEL.md), [policy-check tests](src/lib.rs#L3800) and [Privacy & Private AI proof](#privacy--private-ai).
4. Open the [evidence ledger](docs/EVIDENCE.md).

## Demo links

- Demo video: `<DEMO_VIDEO_URL>`
- X post: `<X_POST_URL>`
- Live app: [handel-live.vercel.app](https://handel-live.vercel.app/) — latest verified production deployment is READY at commit `acf159b3a4346f804064733e65c9a33bcb9456a`; this README-only commit is newer.

## Claim -> Proof

| Claim | Where to verify |
|---|---|
| Delegated key is restricted to exactly four OptionsContract methods; FullAccess and expanded scope are refused. | [near-function-call-signer.ts](sdk/src/near-function-call-signer.ts), [near-function-call-signer.test.ts](sdk/src/near-function-call-signer.test.ts) |
| Contract checks enabled state, expiry, asset, size, premium, collateral and open-position limits for delegated proposals. | [src/lib.rs](src/lib.rs), test `delegated_agent_rejects_every_trade_limit_and_revocation` |
| Principal-only on-chain revocation blocks later agent actions. | [src/lib.rs](src/lib.rs), tests `delegated_agent_revocation_blocks_collateral_initiation_immediately` and `delegated_agent_rejects_every_trade_limit_and_revocation` |
| Agent key cannot call token contracts; principal collateral and holder premium use separate wallet signatures. | [near-function-call-signer.ts](sdk/src/near-function-call-signer.ts), [TestnetProposalComposer.tsx](frontend/src/components/TestnetProposalComposer.tsx), [E-006](docs/EVIDENCE.md#e-006--delegated-agent-implementation) |
| SDK rejects malformed, expired, oversized, disabled and unsupported proposals. | [policy-adversarial.test.ts](sdk/src/policy-adversarial.test.ts) |
| Inference requests reserve against a total budget, per-request cap, request-count cap and prompt/token limits. | [nearai-provider.ts](sdk/src/nearai-provider.ts), test `budget reservations are conservative and never refunded` in [nearai-provider.test.ts](sdk/src/nearai-provider.test.ts) |
| Decision records are append-only and hash-chained; tampering and broken chains fail verification. | [decision-journal.ts](sdk/src/decision-journal.ts), [decision-journal.test.ts](sdk/src/decision-journal.test.ts) |
| Chat uses field-level E2EE and Gateway OHTTP, pins Gateway/model identities and TEE measurements, and verifies response signatures before accepting results. | [nearai-provider.ts](sdk/src/nearai-provider.ts), [nearai-stack.ts](sdk/src/nearai-stack.ts), [nearai-provider.test.ts](sdk/src/nearai-provider.test.ts), [E-001](docs/EVIDENCE.md#e-001--latest-main-ci) |
| Six named CI jobs passed; frontend typecheck/build was skipped on that run. | [E-001](docs/EVIDENCE.md#e-001--latest-main-ci), [CI run #43458722976](https://github.com/devshaydez/handel/actions/runs/43458722976) |

## AI Security & Defense

Handel places model output behind an owner-defined on-chain policy, a restricted FunctionCall key and a principal-controlled revocation path.

- **Limits at execution:** the contract checks asset allowlist, underlying size, premium, Put collateral, expiry and open positions in [src/lib.rs](src/lib.rs); the adversarial boundary tests are in [src/lib.rs](src/lib.rs#L3800).
- **Restricted authority:** [near-function-call-signer.ts](sdk/src/near-function-call-signer.ts) verifies receiver, four-method scope and finite allowance; [its tests](sdk/src/near-function-call-signer.test.ts) reject FullAccess and scope expansion.
- **Independent screening and audit:** [nearai-systemone.ts](sdk/src/nearai-systemone.ts) returns allow/block/review without authorizing execution; [decision-journal.ts](sdk/src/decision-journal.ts) stores hash-chained decisions; see the [threat model](docs/THREAT_MODEL.md).
- **Attested Chat model:** [nearai-stack.ts](sdk/src/nearai-stack.ts) pins Chat model signer and TEE measurements; [nearai-provider.ts](sdk/src/nearai-provider.ts) verifies deployment evidence and response signatures. System One uses Gateway signature verification only.

**Honest limit:** these controls are source- and test-backed, not an independent security audit or a cryptographic proof of every external service.

## Privacy & Private AI

The Chat inference path uses field-level E2EE and Gateway OHTTP, with pinned TEE evidence so the configured model identity and runtime measurements can be checked.

- **Encrypted Chat transport:** the Chat client enables field-level E2EE and Gateway OHTTP in [nearai-provider.ts](sdk/src/nearai-provider.ts#L92-L145); [provider tests](sdk/src/nearai-provider.test.ts#L20-L31) assert both flags in the returned privacy metadata.
- **Pinned deployment identity:** [nearai-stack.ts](sdk/src/nearai-stack.ts#L20-L42) pins Gateway/model signers and compose/OS measurements; [nearai-provider.ts](sdk/src/nearai-provider.ts#L99-L145) rejects empty allowlists and non-allowlisted measurements.
- **Verified responses and CI smoke:** [nearai-provider.ts](sdk/src/nearai-provider.ts#L220-L235) verifies response signatures before returning explanations, and [proposal handling](sdk/src/nearai-provider.ts#L255-L314) applies verification before returning proposals; [provider tests](sdk/src/nearai-provider.test.ts#L20-L70) cover rejection paths. [E-001](docs/EVIDENCE.md#e-001--latest-main-ci) records the successful live NEAR AI → SDK → Sandbox CI job.

**Honest limit:** System One screening uses a separate client with E2EE/OHTTP disabled because that endpoint does not support them, and its configured proof is Gateway-signature verification rather than model TEE attestation; TEE evidence identifies the runtime, not the correctness of model output; NEAR trades and positions remain public.

## Agent Economy

The agent acts as a policy-bounded option writer for its principal: it prepares Call/Put offers, and the holder-side premium is payable to the writer when paid. It also reserves inference spend against hard budgets.

- **Writer/holder flow:** [agent-runtime.ts](sdk/src/agent-runtime.ts) validates proposals and premium evidence; [TestnetProposalComposer.tsx](frontend/src/components/TestnetProposalComposer.tsx) separates principal collateral and holder premium signatures.
- **Inference budgets:** [NearAiBudgetLedger](sdk/src/nearai-provider.ts) enforces total budget, per-request reservation, request count, prompt bytes and completion-token ceilings; see [budget tests](sdk/src/nearai-provider.test.ts).
- **Accountable decisions:** [decision-journal.ts](sdk/src/decision-journal.ts) records proposal terms, market/premium evidence, guardrail result and policy result with a verifiable hash chain.

**Honest limit:** the premium is a fixed demo fixture; no real revenue, negotiated pricing or agent-to-agent hiring is claimed.

## Unstoppable DeFi

For this track, Handel combines policy-bounded option creation with a NEP-141 smart-contract escrow flow; the track name does not describe the whole system.

- **Option lifecycle:** [src/lib.rs](src/lib.rs) defines Call/Put positions, writer/holder roles and escrow registration; [E-005](docs/EVIDENCE.md#e-005--offline-lifecycle-and-sandbox) links the Sandbox scenarios.
- **Separate transfer authority:** the principal signs collateral and the holder signs premium through [TestnetProposalComposer.tsx](frontend/src/components/TestnetProposalComposer.tsx); the agent does not sign either transfer.
- **Direct revocation:** [revoke_agent](src/lib.rs#L1335) checks that the caller is the policy principal and disables the agent in contract state; see `delegated_agent_revocation_blocks_collateral_initiation_immediately`.
- **Settlement boundary:** [E-004](docs/EVIDENCE.md#e-004--tidepool-testnet-read-only-checks) records Tidepool dry quotes; [E-008](docs/EVIDENCE.md#e-008--trust-and-settlement-boundary) records reconciler and custody assumptions.

**Honest limit:** cross-chain NEAR Intents settlement is not demonstrated; only dry quotes and offline payload construction exist. The OptionsContract has an owner and uses a trusted reconciler for external-transfer evidence.

## Quickstart (no secrets)

**Required: Node.js 24.22.1 or newer.** Run from the repository root. No API key, wallet, Rust toolchain or Testnet funds are needed.

```bash
npm --prefix sdk ci
npm --prefix sdk run build
npm --prefix sdk test
npm --prefix sdk run lifecycle
```

Expected: TypeScript compiles, SDK tests run and the lifecycle script prints a deterministic sample proposal, local policy validation and illustrative payload data. No transaction is submitted and no asset moves.

## Optional full proof: AI -> SDK -> Sandbox

Requires `NEARAI_API_KEY`; it is not needed for the quickstart. The runner performs NEAR AI checks, prepares a proposal through the SDK and exercises local NEAR Sandbox contracts with mock NEP-141 assets.

Requirements: Node.js 24.22.1+, npm, Rust/Cargo and `cargo-near` 0.22.0.

```bash
# Linux, macOS or WSL
./scripts/run-e2e-proof-demo.sh

# Windows PowerShell
.\scripts\run-e2e-proof-demo.ps1
```

The Sandbox proof covers the scenarios listed in [E-005](docs/EVIDENCE.md#e-005--offline-lifecycle-and-sandbox); it is not a live Ondo or NEAR Intents settlement.

## Architecture

```text
Assistant
  | proposes Call/Put terms
  v
NEP-413 principal authorization
  v
Server API + restricted FunctionCall key
  v
OptionsContract: policy checks, execution mode, revocation
  v
NEP-141 escrow registration
  |                         |
Principal signs collateral  Holder signs premium
```

**How the agent is constrained**
1. The principal sets asset, size, premium, collateral, expiry and position limits on-chain.
2. The agent key is restricted to one contract, four methods and a finite allowance.
3. The SDK checks current policy; delegated contract entrypoints check policy again.
4. The principal and holder sign their own transfer actions.
5. The principal can revoke the agent on-chain; later delegated actions are rejected.

## Boundaries

- **Network/assets:** Testnet only; synthetic Tidepool assets.
- **Pricing:** fixed demo premium fixture.
- **Settlement:** no live Ondo or cross-chain NEAR Intents settlement; dry quotes and offline payloads only.
- **Lifecycle:** no recorded completed live two-party funding/settlement lifecycle. Escrow is a prototype; the OptionsContract has an owner and external-transfer evidence relies on a trusted reconciler.
