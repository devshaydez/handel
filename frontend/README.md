# Handel frontend

React + TypeScript + Vite. The AI education assistant calls Handel's backend at `/v1/education/answer` through `src/lib/handel-api.ts`. Market data, option pricing, wallet authentication, portfolio balances, proposals, and transaction lifecycle are still demo/mock data; they are not live chain functionality.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck
npm run build      # production bundle in dist/
```

Copy `.env.example` to `.env.local` for local configuration. The Vite proxy forwards `/api/*` to the SDK API on `127.0.0.1:8787`.

## Start the SDK API

In a separate terminal, from the repository's `sdk/` directory:

```bash
npm install
npm run build
npm run server
```

Before starting the server, configure the required server-side environment variables: `NEARAI_API_KEY`, `HANDEL_AI_BUDGET_MICROS`, `HANDEL_AI_MAX_REQUEST_COST_MICROS`, `HANDEL_AI_MAX_REQUESTS`, `HANDEL_AI_MAX_COMPLETION_TOKENS`, `HANDEL_AI_MAX_PROMPT_BYTES`, and `HANDEL_OPTIONS_CONTRACT_ID`. Keep the AI key on the server; never expose it through a `VITE_*` variable.

The bundled SDK API is localhost-only. Do not expose it directly to the public internet. Remote hosting requires a separately authenticated gateway with explicit CORS origins, rate limits, and server-side secrets. Configure `VITE_HANDEL_API_BASE_URL` for that gateway when deploying the frontend.

## What's in the app

Landing page (`#/ `), onboarding and mock wallet (`#/connect`), and the 13 product screens:

| # | Screen | Route |
|---|---|---|
| 1 | Onboarding and wallet connection | `#/connect` |
| 2 | Dashboard | `#/app` |
| 3 | Markets and watchlist | `#/app/markets` |
| 4 | Asset detail and analysis | `#/app/markets/NVDA` |
| 5 | Options chain | `#/app/markets/NVDA/chain` |
| 6 | Trade builder and preview | `#/app/trade?c=NVDA-20261218-C-190` |
| 7 | Portfolio | `#/app/portfolio` |
| 8 | Position detail and lifecycle | `#/app/portfolio/P-1042` |
| 9 | AI assistant | `#/app/assistant` |
| 10 | Agent permissions and automation | `#/app/agent` |
| 11 | AI proposals and Approval Centre | `#/app/proposals` |
| 12 | Activity and decision journal | `#/app/activity` |
| 13 | Settings and security | `#/app/settings` |

Use the **Demo controls** button (bottom left) to switch between populated and empty accounts, normal, stale and down market data, and whether the next simulated transaction confirms, fails or stays unresolved.

## Backend connection status

| Concern | Current state |
|---|---|
| AI assistant | Connected to `POST /v1/education/answer` |
| Backend health | `GET /health` exposed by the API client |
| Wallet connect / signing | Still mock; needs NEAR Wallet Selector and a real signer |
| Assets, chain, prices | Still demo data; needs verified market-data and pricing adapters |
| Submit / track transactions | Still simulated; needs wallet-backed contract calls and receipt verification |
| Policy and risk checks | Frontend checks remain prototype-only; must consume backend/on-chain policy |
| AI proposals and agent cycle | Still simulated in the UI; API advisory preparation exists but is not yet connected to a wallet approval flow |
| Portfolio and activity | Seed data; needs chain/indexer-backed reads |

## Design rules baked in

- Submitted is never shown as completed. Transactions show **submission, execution and settlement** as separate lanes.
- Unknown outcomes stay **Unresolved**, with collateral still reserved, until a re-check confirms them.
- Verified, estimated and unavailable pricing are always labelled. Missing prices show "—", never a guess.
- Only long calls and long puts are executable. Spreads and covered strategies show as locked.
- Connecting a wallet grants the agent nothing. Mode, limits, pause and revoke live on the Agent page.
- Testnet and simulated settlement are called out wherever a route is shown.
