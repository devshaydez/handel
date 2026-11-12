# Handel

## Verified status — 2026-11-12

- PR [#22](https://github.com/devshaydez/handel/pull/22) is merged into `feat/handel-frontend-integration`.
- [GitHub Actions run #43300087425](https://github.com/devshaydez/handel/actions/runs/43300087425) passed all seven jobs, including the frontend production build and live NEAR AI → SDK → approval-gated Sandbox proof.
- OptionsContract and Escrow are deployed/configured on NEAR Testnet.
- The frontend changes pass CI but the final merged commit is not yet confirmed on the public production deployment. Vercel deployment attempts hit the daily Hobby deployment limit after an intermediate-commit build failure.
- Market pricing remains a demo fixture; no live Ondo execution or Mainnet/real-asset settlement is claimed. A green Sandbox proof is not a user-wallet trade.


**Handel** is an AI-assisted, approval-gated options prototype on NEAR. The repository contains the Rust OptionsContract and Escrow contracts, a TypeScript SDK, a local AI service, and a Sandbox proof flow.

## Current working slice

- NEAR AI Chat uses the official Node inference SDK with pinned Gateway/model identities and TEE measurements.
- System One is a separate safety-classification call. Its current configured trust mode is Gateway-signed; it is not represented as a separately model-TEE-attested classifier.
- The same agent exposes education-only answers and advisory option proposals.
- Advisory proposals are checked against an on-chain agent policy read at NEAR finality and require ManualApproval mode.
- The configured **agent account** submits create_agent_proposal; the **principal account** separately signs approve_agent_proposal.
- The SDK refuses to treat an advisory proposal as executable. The AI path has no verified market feed or live option-pricing engine; it replaces model premium output with an explicitly labelled fixed demo fixture.
- The Sandbox lifecycle exercises the OptionsContract, mock NEP-141 collateral, escrow, premium, exercise and settlement callbacks.

## Local advisory API

The local Node service keeps NEARAI_API_KEY out of browser code. It listens on 127.0.0.1:8787 and exposes:

- GET /health
- POST /v1/education/answer
- POST /v1/advisory/proposals

The proposal endpoint reads the configured agent's policy and execution mode from the deployed OptionsContract; it does not trust a browser-supplied permission snapshot. It returns the advisory result and exact contract-call arguments. It never signs or submits a transaction.

See [Local advisory API](docs/ADVISORY_API.md) and [Frontend integration contract](docs/MANUAL_FRONTEND_INTEGRATION.md).

### Start on Windows PowerShell

Build the SDK, set the required environment variables from sdk/.env.example in the current PowerShell session, then:

    cd sdk
    npm install
    npm run build
    npm run server

Required server values include NEARAI_API_KEY, HANDEL_OPTIONS_CONTRACT_ID, HANDEL_AI_BUDGET_MICROS, HANDEL_AI_MAX_REQUEST_COST_MICROS, HANDEL_AI_MAX_REQUESTS, HANDEL_AI_MAX_COMPLETION_TOKENS, and HANDEL_AI_MAX_PROMPT_BYTES. Budget values are local reservation ceilings, not a provider billing quote.

The OptionsContract must already be deployed and the agent must have an enabled on-chain policy in ManualApproval mode. The browser wallet still performs both signing steps separately.

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
