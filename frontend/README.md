# Handel frontend

React + TypeScript + Vite. The AI education assistant calls Handel's backend at `/v1/education/answer` through `src/lib/handel-api.ts`. Market data, option pricing, wallet authentication, portfolio balances, proposals, and transaction lifecycle are still demo/mock data; they are not live chain functionality.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production bundle in dist/
```

`handel-prototype.html` is a single-file build of the same app. Open it in any browser, no install needed.

## What's in the app

Landing page (`#/`), onboarding and mock wallet (`#/connect`), and the 13 product screens:

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

Use the **Demo controls** button (bottom left) to switch between populated and empty accounts, normal, stale and
down market data, and whether the next transaction confirms, fails or stays unresolved.

## Backend connection status

| Concern | File | What to replace |
|---|---|---|
| Wallet connect / disconnect | `src/state/store.ts` → `connectWallet`, `disconnectWallet` | NEAR wallet-selector |
| Wallet signing prompt | `src/components/SignModal.tsx` | `signAndSendTransaction` |
| Assets, chain, prices | `src/data/mock.ts` → `ASSETS`, `getChain`, `makeContract` | market-data and pricing APIs |
| Submit / track transactions | `src/state/store.ts` → `submitOpen`, `submitAction`, `recheckTx` | execution route and receipt tracking |
| Policy and risk checks | `src/lib/policy.ts` → `runChecks` | backend policy engine result (UI only renders it) |
| AI proposals and agent cycle | `src/state/store.ts` → `runAgentCycle`, `src/lib/proposals.ts` | agent service |
| Assistant replies | `src/lib/handel-api.ts` → `askHandelEducation` (called by `src/state/store.ts` → `sendChat`) | Connected to `/v1/education/answer`; server must be running |
| Seed data | `src/data/seed.ts` | remove once real history exists |

## Remaining integration work

- Configure `VITE_HANDEL_API_BASE_URL` for the backend gateway. The default `/api` path is proxied to `http://127.0.0.1:8787` by Vite during local development.
- The bundled SDK API is localhost-only and must not be exposed directly to the public internet. Remote hosting requires a separately authenticated gateway with explicit CORS origins, rate limits, and server-side secrets.
- A real NEAR wallet-selector adapter and chain transaction implementation are not yet present. The current connect/sign/submit flows remain demo-only; no live transaction is signed or submitted by this frontend.
- No production market-data feed, options pricing oracle, or portfolio indexer is configured. Do not treat displayed market figures or seeded balances as live data.

## Design rules baked in

- Submitted is never shown as completed. Transactions show **submission, execution and settlement** as separate lanes.
- Unknown outcomes stay **Unresolved**, with collateral still reserved, until a re-check confirms them.
- Verified, estimated and unavailable pricing are always labelled. Missing prices show "—", never a guess.
- Only long calls and long puts are executable. Spreads and covered strategies show as locked.
- Connecting a wallet grants the agent nothing. Mode, limits, pause and revoke live on the Agent page.
- Testnet and simulated settlement are called out wherever a route is shown.
