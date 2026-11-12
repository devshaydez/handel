# Local advisory API

The SDK includes a small localhost-only HTTP service so a manually built frontend can request an AI proposal without receiving the NEAR AI API key.

## Start

From the repository root, build the SDK and start the service:

```bash
cd sdk
npm install
npm run build
```

Set the values from `.env.example` in the server process environment, then run:

```bash
npm run server
```

The service listens on `127.0.0.1:8787` by default. It deliberately refuses non-loopback binding. A remote deployment requires a separately designed authenticated gateway; do not expose this demo service directly to the internet.

## Routes

- `GET /health` — reports service health and confirms transaction submission is disabled.
- `POST /v1/education/answer` — accepts an educational `question` and optional context; returns a verified education-only response screened by System One.
- `POST /v1/advisory/proposals` — accepts `agentId`, `holder`, and requested option terms (`type`, `assetId`, `quantity`, `strike`, `expiryNs`, `objective`).

The service reads `get_agent_policy` and `get_agent_execution_mode` from the configured OptionsContract at NEAR finality. Both reads must be from the same block. It rejects disabled policies, malformed policy state, and any mode other than `ManualApproval`. The permission snapshot used for the proposal is therefore read from the contract, not accepted from the browser.

The education route uses the same pinned NEAR AI Chat model and shared request-budget ledger, then screens the response with System One. It is education-only and has no market data, wallet or transaction authority.

The proposal route calls the NEAR AI Chat provider and System One guard, applies the fixed demo premium fixture, and returns the advisory proposal plus the exact `create_agent_proposal` arguments. It does not sign, submit, approve, lock collateral, or settle anything.

## Wallet handoff

1. In ManualApproval mode, the configured agent account submits `create_agent_proposal` using a dedicated FunctionCall key scoped only to that method.
2. The contract records the proposal as `PendingApproval`.
3. The **principal account** separately reviews and signs `approve_agent_proposal`.
4. The existing contract lifecycle then governs escrow registration, collateral, premium, exercise and settlement.

The legacy proposal key must be set as `NEAR_AGENT_PROPOSAL_FUNCTION_CALL_PRIVATE_KEY`; unrestricted `NEAR_AGENT_PRIVATE_KEY` is refused. The separate Delegated mode uses `NEAR_AGENT_DELEGATED_FUNCTION_CALL_PRIVATE_KEY` and the four-method allowlist described below.

The SDK enforces the agent/principal signer distinction. A proposal response is not an approval or trade.

## Security and demo limitations

- `NEARAI_API_KEY` remains in the local Node process, not frontend code.
- The server is loopback-only, applies CORS origin allowlisting, request-size limits and process-local rate limiting.
- The budget ledger and rate limits are process-local. They are suitable for a single-process hackathon demo, not a multi-instance hosted service.
- The premium is a fixed demo fixture. There is no verified market feed, live option pricing, or tradable quote in this path.
- Tidepool Testnet assets are synthetic and do not prove Ondo stock-token support.
- The service is an advisory proposal endpoint only. The wallet and on-chain contract remain the authority for signing and approval.
- For public deployment, add wallet-based authentication/session handling, durable shared budgets/rate limits/audit storage, observability, and independent security review before exposing paid inference.


## Delegated Testnet execution endpoint

`POST /api/v1/delegated/trades` is a separate, explicitly Testnet-only route. It requires a server-side `HANDEL_AGENT_API_TOKEN` bearer token and `NEAR_AGENT_DELEGATED_FUNCTION_CALL_PRIVATE_KEY`. The backend verifies that the key is a FunctionCall key scoped to the configured OptionsContract, has exactly the four delegated methods, and has a finite allowance under the configured ceiling. FullAccess keys are refused.

The route reads the current policy and Delegated mode from finalized chain state, checks asset/amount/premium/Put collateral/expiry caps, submits `agent_create_call` or `agent_create_put`, rechecks revocation, then calls `agent_register_escrow_position`. It returns the created option and escrow IDs with state `awaiting_principal_collateral`. The agent does not transfer collateral or premium.

The principal must sign the collateral transfer through `authorizeDelegatedCollateralFunding`. The holder must separately sign premium payment through `authorizeDelegatedPremiumPayment`. These helpers validate wallet identity and on-chain position ownership before asking the connected wallet to sign.

**Current limitations:** the endpoint uses a fixed demo premium fixture and synthetic Tidepool Testnet assets. The Assistant browser UI is not yet wired to this endpoint; the bearer token must never be exposed to browser code. No live delegated trade or deployed contract upgrade is claimed. The old unrestricted `NEAR_AGENT_PRIVATE_KEY` is not accepted for the ManualApproval proposal route; configure a separate `NEAR_AGENT_PROPOSAL_FUNCTION_CALL_PRIVATE_KEY` scoped only to `create_agent_proposal`.
