# Handel

## Unified Assistant and Agent

Handel has **one AI agent**, surfaced through the Assistant. The Assistant is the single conversational interface for education, market analysis, trade planning and (when delegated execution is fully configured) trade submission. The Agent tab is **configuration only**: it controls the same agent's on-chain policy, limits, execution mode and revocation. It is not a second agent and must not maintain a separate decision or execution runtime. Both surfaces must use the same connected principal, agent identity, policy snapshot and audit trail.


## Verified status — 2026-11-13 (supersedes the 2026-11-12 snapshot)

- PR #25 is merged to `main`; the Escrow deploy-script argument fix is on `main` at `8fb39e2b8aa35ead33dc2d655fd40c863840cbe9`.
- OptionsContract deploy-only Testnet transaction: [7pWEFi8adgKeGF7aYYWSfSpMFc5vYWtYtbtkGaBC2z44](https://explorer.testnet.near.org/transactions/7pWEFi8adgKeGF7aYYWSfSpMFc5vYWtYtbtkGaBC2z44). Artifact SHA-256: `53a54422f9d0bd296bdff5a20d7f15d18d2f390fc986af16356aa1a84f12522a`.
- Escrow deploy-only Testnet transaction: [DrQ8m91nef1uzZ11aVcG5B7i8FvLCHqZMKryp496gqeR](https://explorer.testnet.near.org/transactions/DrQ8m91nef1uzZ11aVcG5B7i8FvLCHqZMKryp496gqeR). Artifact SHA-256: `a7d7f1184d813a94c5d1c431ebef01489720e906b4a6d4cf89b957d7245ab604`.
- Latest Vercel production deployment is READY for `8fb39e2`. Live `/api/health` returns `ok=true`, `network=testnet`, `pricingMode=demo_fixture`, and `delegatedExecutionConfigured=true`.
- The delegated and proposal FunctionCall keys were installed on the Testnet agent account with their separate exact method scopes; Vercel production/preview values were updated. The server-only API token was rotated.
- CI run #43314638314 passed all seven jobs on delegated branch head `63d30387d85db728c4b26fba6d1ec4293597f087`; this is not a fresh run on the post-deployment `main` commit. This PR enables main push checks.
- **Not yet proven:** independent live code-hash/state comparison after both upgrades; Assistant browser-to-delegated API wiring; one real two-party wallet-signed Testnet lifecycle with create/register receipts, principal collateral and holder premium; over-limit and post-revocation live rejection receipts.
- Execution remains Testnet-only with synthetic Tidepool assets and fixed demo premium. No Mainnet, live Ondo pricing, or real-asset settlement claim.

 Handel

## Unified Assistant and Agent

Handel has **one AI agent**, surfaced through the Assistant. The Assistant is the single conversational interface for education, market analysis, trade planning and (when delegated execution is fully configured) trade submission. The Agent tab is **configuration only**: it controls the same agent's on-chain policy, limits, execution mode and revocation. It is not a second agent and must not maintain a separate decision or execution runtime. Both surfaces must use the same connected principal, agent identity, policy snapshot and audit trail.


## Verified status — 2026-11-12

- PR [#25](https://github.com/devshaydez/handel/pull/25) contains the delegated contract path, SDK signer/executor, Vercel Testnet endpoint, wallet funding helpers, tests and updated handoff.
- Baseline commit `9331688a6c6a1ff7ebf884a1e69e2a0467153291` passed all seven jobs in [GitHub Actions run #43310008665](https://github.com/devshaydez/handel/actions/runs/43310008665), including Rust/Sandbox integration and the live NEAR AI → SDK → Sandbox proof. Subsequent execution-integration commits require their own CI run.
- The delegated contract path keeps root Borsh state and OptionPosition layouts unchanged. Agent attribution uses a separate raw-storage key. Every delegated lifecycle call re-checks enabled state, mode, expiry, principal attribution, allowlist and current limits.
- The backend now has a restricted FunctionCall-key signer and a Testnet endpoint at `POST /api/v1/delegated/trades`. The key is checked on-chain before calls: receiver must be `options.shaydez.testnet`, method allowlist must be exactly the four delegated methods, and the finite NEAR allowance must be within the configured ceiling. FullAccess keys are refused.
- The agent creates the option and registers the Escrow position. It never transfers tokens. The principal signs collateral funding; the holder signs premium payment. Frontend wallet helpers enforce those separate roles.
- The Assistant is the single AI interface; the Agent tab configures the same agent. The current demo Assistant UI is not yet wired to the delegated endpoint, and the backend endpoint requires a server-side bearer token. Do not describe the browser UI as autonomously trading yet.
- The endpoint uses the configured fixed demo premium fixture and synthetic Tidepool Testnet assets. No live option-price feed, Mainnet route, real Ondo token, or real-asset settlement is claimed.
- No live delegated trade has been executed. Contract upgrade, restricted key provisioning, Vercel environment configuration/deployment and receipt evidence remain release gates.


**Handel** is an AI-assisted, approval-gated options prototype on NEAR. The repository contains the Rust OptionsContract and Escrow contracts, a TypeScript SDK, a local AI service, and a Sandbox proof flow.

## Current working slice

- NEAR AI Chat uses the official Node inference SDK with pinned Gateway/model identities and TEE measurements.
- System One is a separate safety-classification call. Its current configured trust mode is Gateway-signed; it is not represented as a separately model-TEE-attested classifier.
- The same agent exposes education-only answers and advisory option proposals.
- Existing advisory proposals are checked against an on-chain agent policy read at NEAR finality and require ManualApproval mode. The new delegated path is separate and must be explicitly enabled by the principal on-chain.
- The legacy proposal flow has the configured **agent account** submit create_agent_proposal and the **principal account** separately sign approve_agent_proposal. The delegated path instead uses a dedicated restricted function-call key on the agent account; it does not grant the agent the principal's key.
- The delegated SDK executor reads the current policy and Delegated mode from one finalized block, submits create Call/Put, re-checks revocation, registers the Escrow position, and verifies the returned position. It returns `awaiting_principal_collateral`; it does not move collateral or premium.
- The Vercel delegated endpoint is a Testnet/mock execution path, not the complete Assistant loop. It uses a fixed demo premium fixture and requires a restricted agent key plus a server-only bearer token. The Assistant UI still needs to call this endpoint through a secure wallet-session flow; do not put the bearer token in frontend variables.
- The Sandbox lifecycle exercises the OptionsContract, mock NEP-141 collateral, escrow, premium, exercise and settlement callbacks.

## Local advisory API

The local Node service keeps NEARAI_API_KEY out of browser code. It listens on 127.0.0.1:8787 and exposes:

- GET /health
- POST /v1/education/answer
- POST /v1/advisory/proposals

The proposal endpoint reads the configured agent's policy and execution mode from the deployed OptionsContract; it does not trust a browser-supplied permission snapshot. It returns the advisory result and exact contract-call arguments. It never signs or submits a transaction. The separate Vercel-only delegated endpoint is documented below.

See [Local advisory API](docs/ADVISORY_API.md) and [Frontend integration contract](docs/MANUAL_FRONTEND_INTEGRATION.md).

### Start on Windows PowerShell

Build the SDK, set the required environment variables from sdk/.env.example in the current PowerShell session, then:

    cd sdk
    npm install
    npm run build
    npm run server

Required server values include NEARAI_API_KEY, HANDEL_OPTIONS_CONTRACT_ID, HANDEL_AI_BUDGET_MICROS, HANDEL_AI_MAX_REQUEST_COST_MICROS, HANDEL_AI_MAX_REQUESTS, HANDEL_AI_MAX_COMPLETION_TOKENS, and HANDEL_AI_MAX_PROMPT_BYTES. Budget values are local reservation ceilings, not a provider billing quote.

The OptionsContract must already be deployed and the agent must have an enabled on-chain policy in ManualApproval mode. The browser wallet still performs both signing steps separately.



## Try it — delegated Testnet execution

This is a backend-only smoke path for the synthetic Tidepool wNEAR Testnet asset. It is not exposed to the browser until wallet-session authentication is wired. Never put these secrets in `VITE_*` variables.

Configure these Vercel/server environment variables:
- `NEAR_AGENT_ACCOUNT_ID`: dedicated Testnet agent account (distinct from the principal).
- `NEAR_AGENT_DELEGATED_FUNCTION_CALL_PRIVATE_KEY`: private key for a restricted FunctionCall access key on that agent account.
- `HANDEL_AGENT_API_TOKEN`: high-entropy server-only bearer token.
- `HANDEL_OPTIONS_CONTRACT_ID=options.shaydez.testnet` and `NEAR_RPC_URL=https://rpc.testnet.fastnear.com`.
- Optional: `HANDEL_AGENT_MAX_KEY_ALLOWANCE_YOCTO` (default ceiling: 1 NEAR) and `HANDEL_DEMO_PREMIUM_FIXTURE=5000000` (5 USDC base units).
- The access key must have receiver `options.shaydez.testnet`, a finite allowance, and exactly these method names: `agent_create_call`, `agent_create_put`, `agent_begin_collateral_lock`, `agent_register_escrow_position`. The backend verifies this on-chain before each transaction and refuses FullAccess keys.
- The legacy ManualApproval proposal route uses a separate `NEAR_AGENT_PROPOSAL_FUNCTION_CALL_PRIVATE_KEY` restricted to `create_agent_proposal`; the old unrestricted `NEAR_AGENT_PRIVATE_KEY` is no longer accepted.

Example request (replace the token and use current policy-compliant amounts/expiry):

    curl -X POST https://handel-live.vercel.app/api/v1/delegated/trades ^
      -H "Authorization: Bearer $HANDEL_AGENT_API_TOKEN" ^
      -H "Content-Type: application/json" ^
      -d "{\"principal\":\"principal.testnet\",\"holder\":\"holder.testnet\",\"request\":{\"type\":\"Call\",\"assetId\":\"nep141:wnear.tidepool-sandbox.testnet\",\"quantity\":\"1000000000000000000\",\"strike\":\"1000000\",\"expiryNs\":\"<future-nanoseconds>\"}}"

A successful response is `awaiting_principal_collateral` and includes the OptionsContract position ID, Escrow position ID, and both agent transaction hashes. The principal then uses the connected wallet to call `authorizeDelegatedCollateralFunding(positionId, escrowPositionId)`; the holder separately uses `authorizeDelegatedPremiumPayment(positionId, escrowPositionId)`. Neither transfer helper can be called by the agent key. The demo endpoint is not a live market quote: its premium is a configured fixture.

## End-to-end proof

On Windows, run:

    .\scripts\run-e2e-proof-demo.ps1

The PowerShell runner installs the checksum-pinned cargo-near 0.22.0 prebuilt release binary automatically if it is missing; it does not compile cargo-near from source. To skip local Wasm compilation entirely, download the handel-sandbox-wasm artifact from the successful GitHub Actions run, place its contents under target/near, and use:

    .\scripts\run-e2e-proof-demo.ps1 -UsePrebuiltWasm

On Linux/macOS/WSL:

    ./scripts/run-e2e-proof-demo.sh

The proof path runs live Chat + System One, feeds the result through the Handel advisory SDK, then uses the SDK-prepared contract arguments in the Sandbox lifecycle. The workflow also runs this integrated proof in GitHub Actions.

## Explicit demo and release boundaries

This is a **simulation-backed hackathon slice**, not a production trading venue:

- Tidepool Testnet assets are synthetic. They do not prove live Ondo tokenized-stock support.
- The advisory premium is a fixed demo fixture; no verified live market feed or production pricing is configured.
- Sandbox mock tokens and local callbacks do not prove real Testnet collateral movement or real Intents settlement.
- Settlement still has trusted reconciliation paths for ambiguous callback failures; receipt logs and multiple RPC origins are not a NEAR light-client proof.
- The bundled HTTP service is localhost-only and process-local. Public hosting requires wallet/session authentication, durable shared budgets and rate limits, persistent audit storage, monitoring and security review.
- Testnet deployment, agent-account provisioning, policy configuration and wallet signing are separate release operations; no contract deployment or real asset movement is performed by CI.

Do not present a simulated proposal, premium, collateral transfer, or settlement as a live trade.

## Development checks

GitHub Actions validates Rust formatting, contract/Wasm builds, workspace tests, SDK build/tests, the offline lifecycle, read-only Testnet asset checks, live NEAR AI attestation/inference, and the live AI → SDK → Sandbox proof.

The full frontend-excluded delivery checklist and remaining gates are in [Final backend readiness](docs/FINAL_BACKEND_READINESS.md).
