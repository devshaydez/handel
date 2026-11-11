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
- `POST /v1/advisory/proposals` — accepts `agentId`, `holder`, and requested option terms (`type`, `assetId`, `quantity`, `strike`, `expiryNs`, `objective`).

The service reads `get_agent_policy` and `get_agent_execution_mode` from the configured OptionsContract at NEAR finality. Both reads must be from the same block. It rejects disabled policies, malformed policy state, and any mode other than `ManualApproval`. The permission snapshot used for the proposal is therefore read from the contract, not accepted from the browser.

The service then calls the NEAR AI Chat provider and System One guard, applies the fixed demo premium fixture, and returns the advisory proposal plus the exact `create_agent_proposal` arguments. It does not sign, submit, approve, lock collateral, or settle anything.

## Wallet handoff

1. The configured **agent account** signs `create_agent_proposal` using the connected wallet.
2. The contract records the proposal as `PendingApproval`.
3. The **principal account** separately reviews and signs `approve_agent_proposal`.
4. The existing contract lifecycle then governs escrow registration, collateral, premium, exercise and settlement.

The SDK enforces the agent/principal signer distinction. A proposal response is not an approval or trade.

## Security and demo limitations

- `NEARAI_API_KEY` remains in the local Node process, not frontend code.
- The server is loopback-only, applies CORS origin allowlisting, request-size limits and process-local rate limiting.
- The budget ledger and rate limits are process-local. They are suitable for a single-process hackathon demo, not a multi-instance hosted service.
- The premium is a fixed demo fixture. There is no verified market feed, live option pricing, or tradable quote in this path.
- Tidepool Testnet assets are synthetic and do not prove Ondo stock-token support.
- The service is an advisory proposal endpoint only. The wallet and on-chain contract remain the authority for signing and approval.
- For public deployment, add wallet-based authentication/session handling, durable shared budgets/rate limits/audit storage, observability, and independent security review before exposing paid inference.
