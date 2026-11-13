# Handel

An AI agent that can trade options on NEAR but provably cannot exceed the limits its owner set on-chain, and cannot touch anyone's funds.

**NEAR Hackathon submission deadline:** 2026-11-14 23:59 UTC.

## Demo

- Demo video: `<DEMO_VIDEO_URL>`
- X post: `<X_POST_URL>`
- Live app: [handel-live.vercel.app](https://handel-live.vercel.app/) — the deployment recorded in [E-007](docs/EVIDENCE.md) serves commit `67f6dd01c55932f39411c36fdfcc4f46f1a2aefb`, not the current repository `main`. Treat it as an older preview, not the submitted source.

## Hackathon tracks

### AI Security & Defense

- **On-chain policy limits and revocation:** principal-bound asset, size, premium, collateral, expiry and open-position limits are checked by contract entrypoints; see [E-006](docs/EVIDENCE.md) and [src/lib.rs](src/lib.rs).
- **Restricted agent authority:** [near-function-call-signer.ts](sdk/src/near-function-call-signer.ts) verifies a FunctionCall key for the OptionsContract, exactly four delegated methods and a finite allowance; it rejects FullAccess keys. See [E-006](docs/EVIDENCE.md).
- **Independent screening:** the [System One guard](sdk/src/nearai-systemone.ts) returns allow/block/review and does not authorize execution; the integrated smoke is recorded in [E-005](docs/EVIDENCE.md).
- **Audit trail and threat model:** the append-only, hash-chained journal is implemented in [decision-journal.ts](sdk/src/decision-journal.ts); trust boundaries and residual risks are in [THREAT_MODEL.md](docs/THREAT_MODEL.md).

### Privacy & Private AI

- **TEE pinning:** [nearai-stack.ts](sdk/src/nearai-stack.ts) pins approved Gateway/model signers and model compose/OS measurements; the live AI smoke is recorded in [E-005](docs/EVIDENCE.md).
- **Response verification:** [nearai-provider.ts](sdk/src/nearai-provider.ts) verifies deployment attestations and response signatures before accepting proposals or explanations.
- **Chat privacy:** the shipped Chat client enables field-level E2EE and Gateway OHTTP in [nearai-provider.ts](sdk/src/nearai-provider.ts).
- **System One boundary:** [nearai-systemone.ts](sdk/src/nearai-systemone.ts) uses a separate client with E2EE and OHTTP disabled because that path does not support them. Do not read the Chat privacy settings as applying to System One.

### Unstoppable DeFi

- **Options protocol:** the OptionsContract implements Call/Put terms and policy-bounded lifecycle entrypoints; local Escrow/Sandbox scenarios are recorded in [E-005](docs/EVIDENCE.md).
- **Separate wallet authority:** the agent cannot transfer principal collateral or holder premium; the composer requests the principal's collateral signature and the holder's premium signature separately. See [E-006](docs/EVIDENCE.md) and [TestnetProposalComposer.tsx](frontend/src/components/TestnetProposalComposer.tsx).
- **Non-custodial agent boundary:** the restricted signer calls only the OptionsContract and never a token contract; the current Escrow prototype uses NEP-141 test-token flows, not verified Intents custody. See [near-function-call-signer.ts](sdk/src/near-function-call-signer.ts) and [E-006](docs/EVIDENCE.md).
- **NEAR Intents status:** cross-chain settlement is not demonstrated. What exists today is offline illustrative payload construction and Tidepool dry quotes, not committed quotes, fills or transfers. See [E-004](docs/EVIDENCE.md) and [E-005](docs/EVIDENCE.md).

### `<THIRD_TRACK>`

Submission track details to be added.

## Quickstart

**Required: Node.js 24.22.1 or newer.** Run from the repository root. No API key, wallet, Rust toolchain or Testnet funds are needed for this offline SDK demo.

```bash
npm --prefix sdk ci
npm --prefix sdk run build
npm --prefix sdk test
npm --prefix sdk run lifecycle
```

Expected: dependency installation completes, TypeScript compiles, SDK tests run, and the lifecycle script prints a deterministic sample proposal, local policy validation and illustrative contract/payload data. The demo submits no transaction and moves no assets.

## Optional full proof: AI → SDK → Sandbox

This longer proof requires `NEARAI_API_KEY` (optional; not needed for the quickstart). It runs live NEAR AI Chat/System One checks, prepares a proposal through the SDK, then exercises local NEAR Sandbox contracts with mock NEP-141 assets. It is not a live Testnet trade or Ondo settlement.

Requirements: Node.js 24.22.1+, npm, Rust/Cargo, and `cargo-near` 0.22.0. The Bash runner checks for the pinned cargo-near version; the PowerShell runner can install its pinned release.

```bash
# Linux, macOS or WSL
./scripts/run-e2e-proof-demo.sh

# Windows PowerShell
.\\scripts\\run-e2e-proof-demo.ps1
```

The proof's expected terminal result is `PASS` for the simulated vertical slice. It does not prove live Ondo support, production NEAR Intents settlement, external-chain proof or production custody. See [E-005](docs/EVIDENCE.md).

## Architecture

```text
Assistant (single AI interface)
  ├─ proposes strategy / trade terms
  └─ obtains principal's NEP-413 authorization
       ↓
Server API + restricted agent FunctionCall key
       ↓
OptionsContract (on-chain policy, limits, mode, revocation)
       ↓
Escrow registration (Testnet prototype)
       ↓
Principal signs collateral ── Holder signs premium
```

**How the agent is constrained**
1. The principal defines the asset allowlist, numeric limits and execution mode on-chain.
2. The backend key is a restricted FunctionCall key for one contract and four named methods, with finite allowance.
3. The SDK re-reads key authority and policy; the contract re-checks policy at delegated entrypoints.
4. The principal and holder retain their own wallet signatures for collateral and premium transfers.
5. Disabling/revoking policy blocks subsequent delegated calls; the agent has no token-transfer authority.

## Status & evidence

| Proven in the evidence ledger | Not demonstrated |
|---|---|
| OptionsContract Testnet deployment and exact Wasm match ([E-002](docs/EVIDENCE.md)). | Mainnet deployment, real-money trading or production custody. |
| Tidepool Testnet asset/verifier checks and dry quote ([E-004](docs/EVIDENCE.md)). | Ondo token support, committed quote, solver fill or asset transfer. |
| Offline SDK lifecycle and local Sandbox tests ([E-005](docs/EVIDENCE.md)). | Completed live two-party Testnet funding/settlement lifecycle. |
| Delegated implementation, policy rechecks and restricted-key verification ([E-006](docs/EVIDENCE.md)). | A recorded live agent-created trade with principal collateral and holder premium receipts. |
| NEAR AI/System One integrated smoke ([E-005](docs/EVIDENCE.md)); trust assumptions are documented in [THREAT_MODEL.md](docs/THREAT_MODEL.md). | Independent security audit, light-client proof or cryptographic proof from the trusted reconciler. |
| CI run [#43458722976](https://github.com/devshaydez/handel/actions/runs/43458722976) passed six jobs on the commit recorded in [E-001](docs/EVIDENCE.md). | Frontend typecheck/build on that run; the frontend job was skipped. |

**Current execution boundary:** Testnet only; Tidepool synthetic assets; fixed demo premium; no live Ondo/NEAR Intents settlement; no evidenced completed live two-party lifecycle. The OptionsContract is a policy/lifecycle component, not an Intents asset custodian. See [EVIDENCE.md](docs/EVIDENCE.md), [THREAT_MODEL.md](docs/THREAT_MODEL.md), and [CUSTODY_AND_SETTLEMENT.md](docs/CUSTODY_AND_SETTLEMENT.md).

**Differentiator:** Handel combines European-style options lifecycle controls with an AI agent whose delegated authority is bounded by owner-set on-chain policy and separate wallet signatures.

