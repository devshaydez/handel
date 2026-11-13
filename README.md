# Handel

Handel is a NEAR-based European-style options prototype for Ondo tokenized stocks, paired with an AI agent that can create policy-bounded Testnet trades under hard on-chain limits.

## Current honest status (Nov 13 2026)

| Area | Implemented / verified | Boundary |
|---|---|---|
| Options | Rust OptionsContract supports Call/Put terms, writer/holder roles, expiry and lifecycle transitions. | The current deployed contract is a policy/lifecycle component, not a complete Ondo custody or settlement system. |
| Agent | One Assistant/Agent system; delegated Call/Put creation and Escrow registration are implemented. Contract policy is checked on-chain; the restricted key is limited to named contract methods. | A real wallet-authorized delegated Testnet trade and full two-party funding lifecycle have not been evidenced in the public evidence log. |
| Agent authority | On-chain allowlists, size/premium/collateral/expiry/open-position limits, execution mode and revocation are enforced by contract entrypoints. | The agent does not control the principal's or holder's wallet and cannot transfer their tokens. |
| Testnet | OptionsContract is deployed at `options.shaydez.testnet`; the user verified its on-chain Wasm SHA-256 against the deployed artifact. Tidepool Testnet assets and read-only checks are used for integration testing. | Tidepool is community-operated. Its test assets are synthetic and do not establish Ondo stock-token support. |
| Offline | Deterministic proposal fallback, mock Intents payload construction, local Sandbox contracts and mock NEP-141 lifecycle tests are implemented. | Mock payloads and Sandbox balances are not Testnet or Mainnet asset movement. |
| Pricing | A deterministic Black–Scholes reference engine and evidence-verifier interfaces exist. | No approved live execution oracle or production option-pricing feed is configured. The delegated Testnet path uses a fixed demo premium fixture. |
| Frontend | Assistant, Agent policy controls, Testnet composer, wallet signing helpers, Portfolio and Activity surfaces exist. | Live market data is unavailable. Portfolio reconstruction is incomplete; Activity persistence depends on optional indexer configuration. |
| Hosting | Production Vercel alias is live. | It currently serves commit `67f6dd01`, not current `main` commit `0d43cc63`. Do not assume the latest repository changes are live. |

**Verified contract artifact:** `options.shaydez.testnet` deployment transaction [5VL24bzw5XHdFunUZoWFGJ6ZVaC8uoHLRvLgT8fSmZzz](https://explorer.testnet.near.org/transactions/5VL24bzw5XHdFunUZoWFGJ6ZVaC8uoHLRvLgT8fSmZzz); Wasm size 425,264 bytes; SHA-256 `1d95e9b75d94c13eea83e708502aff0a4c54c7eee4bb09881482403bb9479ab3`. The matching on-chain hash was checked from the Testnet RPC response on Nov 13.

**Latest PR validation:** [run #43458722976](https://github.com/devshaydez/handel/actions/runs/43458722976) passed all seven jobs, including frontend typecheck and production build, on PR head `3d9d992beadb273927781cb0e59732bcc78a15d7` before merge as `f7da7824e8802c8080658949ea74e2b6a6f60a19`. The subsequent main-branch documentation refresh is at `0d43cc63eaf7ddca8480e69bac81af4c1ebf0571`; its latest push workflow [#43462193852](https://github.com/devshaydez/handel/actions/runs/43462193852) was pending at this snapshot.

**Not claimed:** no Mainnet deployment, no live Ondo asset custody, no Mainnet NEAR Intents settlement for NVDAon/TSLAon/AAPLon/SPYon, no real-money trade, no independently verified external-chain settlement proof, and no completed production security audit.

## What it does

Handel is designed for fully collateralized European-style options: Gap calls and Floor puts on Ondo tokenized stocks NVDAon, TSLAon, AAPLon and SPYon. A writer and a distinct holder enter fixed option terms; the intended payoff is physical delivery rather than cash settlement. The intended production asset/settlement rail is NEAR Intents.

The AI agent proposes or initiates trades, but it is not the authority. The OptionsContract checks the current principal-bound policy, asset allowlist, execution mode, expiry, amount and position limits. The delegated agent can create an option and register its Escrow record when Delegated mode is enabled. The principal still signs collateral funding; the holder separately signs premium payment. The agent cannot spend either wallet's tokens.

The current contracts do not yet reserve Ondo collateral inside the NEAR Intents verifier ledger, and the current Escrow prototype uses NEP-141 transfers rather than a verified NEP-245 Intents custody path. Exact Ondo Intents asset IDs, standards, quote support and per-position reservation are release gates. Today, the executable Testnet example uses Tidepool synthetic wNEAR and a fixed premium fixture—not Ondo stock tokens.

## Why it matters (positioning)

| Project | Primary emphasis | Handel's distinction |
|---|---|---|
| Warrant | Intents-native, fully collateralized options with on-chain proof and locked collateral. | Handel combines an options product direction for tokenized equities with a constrained AI agent and explicit policy/revocation controls. Warrant's live Intents settlement and locked-contract evidence are not claims Handel can make. |
| Intatto | Constrained AI trading vault with public-key/canary and trust-boundary evidence. | Handel applies hard on-chain agent permissions to options creation and lifecycle initiation, with separate writer/holder wallet authority. |
| Handel | European-style options on Ondo tokenized-stock exposure plus an AI agent that can create bounded Testnet trades. | The combination is the differentiator; the Ondo route and production settlement remain future integration gates. |

The product distinction is architectural, not a claim of parity with projects that already demonstrate live Mainnet settlement.

## Try it (do X → see Y)

### Offline lifecycle demo

Requirements: Node.js 24.22.1+, npm, Rust/Cargo, and the repository-pinned cargo-near 0.22.0. The full proof additionally requires a NEAR AI Cloud API key.

1. Clone the repository:

   ```bash
   git clone https://github.com/devshaydez/handel.git
   cd handel
   ```

2. Build and test the SDK:

   ```bash
   npm --prefix sdk ci
   npm --prefix sdk run build
   npm --prefix sdk test
   ```

   **See:** TypeScript compilation and SDK tests complete successfully.

3. Run the deterministic offline proposal and payload demo:

   ```bash
   npm --prefix sdk run lifecycle
   ```

   **See:** a deterministic sample proposal, local policy validation, contract-compatible call arguments, and illustrative collateral/premium/settlement payloads. The script submits no transaction and moves no asset.

4. Run the integrated AI → SDK → Sandbox proof. Set `NEARAI_API_KEY` in the shell; do not commit it:

   ```bash
   # Linux / macOS / WSL
   ./scripts/run-e2e-proof-demo.sh

   # Windows PowerShell
   .\scripts\run-e2e-proof-demo.ps1
   ```

   **See:** live NEAR AI inference and System One screening feed a simulated proposal into local NEAR Sandbox contracts and mock NEP-141 tokens. The test exercises Call/Put registration, approval, collateral/premium deposits and settlement callbacks. This is a local Sandbox proof, not a Testnet trade or Ondo settlement.

### Testnet / Tidepool paths

These checks are read-only or dry-quote checks; they do not commit a quote, create a deposit address, or transfer tokens:

```bash
node scripts/verify-testnet-assets.mjs
node scripts/verify-tidepool-verifier.mjs
node scripts/verify-tidepool-dry-quote.mjs
```

**See:** the configured Tidepool test-token registry/verifier checks and, when the service responds, a dry quote. The latest CI run passed the read-only asset/verifier/dry-quote job. A dry quote is not execution.

The Assistant includes a delegated Testnet composer for synthetic `nep141:wnear.tidepool-sandbox.testnet`. It requires a principal-signed NEP-413 authorization, a distinct holder, a configured server-side restricted agent key, an enabled on-chain policy and Delegated mode.

**If the prerequisites are satisfied:** the agent creates the option and registers Escrow; the UI then asks the principal to sign collateral funding and the holder to sign premium payment. The agent cannot perform those wallet transfers. Do not use this path with real assets. No complete live two-party lifecycle is currently recorded as evidence.

### What is mocked

- Offline NEAR Intents payloads are illustrative JSON; no Intents transaction is submitted.
- Sandbox NEP-141 tokens and local contract state are test fixtures.
- Delegated Testnet premium is a fixed server-side demo fixture, not a market quote.
- Tidepool assets are synthetic and Tidepool is a community-operated environment.
- Ondo ticker labels in product design do not mean the corresponding assets are available on Tidepool or supported by the deployed escrow.

## Architecture overview

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

- `contracts/`: OptionsContract, Escrow and mock NEP-141 token.
- `sdk/`: policy validation, NEAR signing/execution helpers, pricing references, indexer and offline lifecycle.
- `agent/` and `api/`: agent instructions and server-side API routes.
- `frontend/`: React/Vite app, Assistant and Agent configuration surfaces.
- `scripts/`: build, proof, deployment-safety and read-only Testnet checks.

Deeper design: [Architecture](docs/ARCHITECTURE.md), [Settlement architecture](docs/SETTLEMENT_ARCHITECTURE.md), [Ondo/Intents route gates](docs/ONDO_NEAR_INTENTS_ROUTE.md), [Pricing gates](docs/MARKET_DATA_AND_PRICING_GATES.md), [Threat model](docs/THREAT_MODEL.md).

## Security & trust assumptions

| Trust root / boundary | What it can do | What it does not prove |
|---|---|---|
| NEAR account owner / wallet | Authorizes policy, upgrades, principal collateral and other wallet actions. | The application cannot replace wallet approval or recover a compromised owner key. |
| Restricted agent FunctionCall key | Calls only the configured OptionsContract receiver and allowlisted delegated methods, with bounded allowance. | Key compromise can still create policy-compliant trades until the key is revoked or policy disabled. |
| On-chain OptionsContract policy | Enforces principal binding, enabled state, mode, allowlist, amount/premium/collateral/expiry/open-position bounds and attribution. | It does not itself custody the underlying asset or prove an external transfer. |
| Server/API runtime | Holds restricted signing material and server-only session/API secrets; performs preflight and orchestration. | Server availability, secret storage, request authentication and operational controls remain trusted components. |
| Escrow controller / contract owner | Controls configured registration/administrative roles and selected authority transitions. | Two-step ownership transfer is not a multisig, timelock or independent governance system. |
| Reconciler / evidence attestor | Can resolve specifically configured ambiguous operation states using supplied evidence fields. | A reconciler assertion is not a cryptographic proof, independent chain verification or light-client proof. |
| NEAR RPC providers | Supply finalized state and receipt observations; SDK can corroborate across RPC origins. | RPC quorum is not a NEAR light client and does not prove remote-chain settlement. |
| Tidepool | Supplies a community Testnet verifier, token registry and dry-quote environment. | Not official NEAR/1Click infrastructure, not a guarantee of liquidity, and not proof of Ondo support. |
| NEAR AI provider / model | Produces advice and screening output; CI verifies the configured TEE evidence path. | TEE attestation does not make model output correct, safe or an oracle. |
| Mock/Sandbox components | Exercise local state transitions and callback behavior. | No live funds, Ondo assets, Mainnet Intents finality or production custody. |

The most important custody limitation: the OptionsContract is a policy/lifecycle state machine, not the custodian of NEAR Intents balances. The Escrow prototype handles NEP-141 test-token flows; the current design does not establish enforceable per-position reservation of Ondo assets inside Intents. Escrow payout legs are asynchronous and not atomic. See [Threat model](docs/THREAT_MODEL.md) and [Custody boundary](docs/CUSTODY_AND_SETTLEMENT.md).

## Evidence

- [Evidence ledger](docs/EVIDENCE.md) — claim-by-claim status, hashes, receipts and what each item proves.
- [Latest GitHub Actions run](https://github.com/devshaydez/handel/actions/runs/43425939138) — commit `371fe36c3ee376a294714d06b79c73a1170fe70c`; six jobs passed, frontend build/typecheck skipped.
- [OptionsContract deployment transaction](https://explorer.testnet.near.org/transactions/5VL24bzw5XHdFunUZoWFGJ6ZVaC8uoHLRvLgT8fSmZzz) — deploy transaction; exact deployed Wasm SHA-256 was subsequently compared with the local artifact.
- [Escrow deployment transaction](https://explorer.testnet.near.org/transactions/DrQ8m91nef1uzZ11aVcG5B7i8FvLCHqZMKryp496gqeR) — deploy-only transaction for the Escrow prototype; does not prove an end-to-end trade.
- [Production UI audit](docs/PRODUCTION_UI_AUDIT_2026-11-13.md) — read-only audit findings and UI scope.

Evidence labels are deliberately distinct: **implemented**, **unit-tested**, **Sandbox-tested**, **Testnet-deployed**, **Testnet-verified**, and **production-deployed** are not interchangeable.

## Known limitations & non-goals

- No Mainnet deployment or real-money trading.
- No Mainnet NEAR Intents settlement for Ondo tokenized stocks.
- No verified Tidepool support for NVDAon, TSLAon, AAPLon or SPYon.
- No demonstrated Ondo collateral reservation, NEP-245 custody integration or paired-intent physical delivery.
- No approved live execution oracle, volatility surface or market-derived option premium.
- The delegated Testnet example uses synthetic wNEAR and a fixed premium fixture.
- No public evidence of a complete agent-create → principal-collateral → holder-premium Testnet lifecycle.
- The reconciler/evidence-attestor path remains a trust assumption; RPC corroboration is not a light client.
- Escrow payout legs are sequential asynchronous transfers, not atomic cross-asset settlement.
- Portfolio indexing is incomplete; Activity history depends on optional persistent indexer configuration.
- The current production Vercel alias lags the latest `main` commit.
- No independent security audit or production custody review is claimed.

Non-goals for this submission: hiding mock paths behind live-looking stock prices, presenting a dry quote as a fill, treating a model response as a price oracle, or describing policy-bounded trade creation as autonomous custody of user funds.

## Tracks

- **Primary — Unstoppable DeFi:** fully collateralized European-style options design, on-chain lifecycle controls and explicit settlement constraints.
- **Agent Economy / AI Security — conditional:** include only if the submission demonstrates the single agent's on-chain allowlists, bounded restricted key, policy rechecks and revocation behavior with current tests/evidence. Do not claim autonomous token custody or unattended settlement.

## Build & test

Run from the repository root.

```bash
# Rust formatting and workspace tests
cargo fmt --all -- --check
cargo test --workspace

# SDK
npm --prefix sdk ci
npm --prefix sdk run build
npm --prefix sdk test
npm --prefix sdk run lifecycle

# Frontend
npm --prefix frontend install --no-audit --no-fund
npm --prefix frontend run typecheck
npm --prefix frontend run build

# Full AI -> SDK -> local Sandbox proof (requires NEARAI_API_KEY)
# Linux/macOS/WSL:
./scripts/run-e2e-proof-demo.sh
# Windows PowerShell:
.\scripts\run-e2e-proof-demo.ps1
```

The latest CI run did not execute the frontend job (it was skipped), so run the frontend commands above before treating the current frontend build as verified. See [CI workflow](.github/workflows/contract-checks.yml) for the authoritative automated checks.
