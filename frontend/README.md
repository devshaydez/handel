# Handel frontend

React + TypeScript + Vite. Everything is **mocked**: auth, market data, pricing, transactions and the AI.
Nothing here talks to a network. The backend wiring points are listed below.

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

## Where the backend plugs in

| Concern | File | What to replace |
|---|---|---|
| Wallet connect / disconnect | `src/state/store.ts` → `connectWallet`, `disconnectWallet` | NEAR wallet-selector |
| Wallet signing prompt | `src/components/SignModal.tsx` | `signAndSendTransaction` |
| Assets, chain, prices | `src/data/mock.ts` → `ASSETS`, `getChain`, `makeContract` | market-data and pricing APIs |
| Submit / track transactions | `src/state/store.ts` → `submitOpen`, `submitAction`, `recheckTx` | execution route and receipt tracking |
| Policy and risk checks | `src/lib/policy.ts` → `runChecks` | backend policy engine result (UI only renders it) |
| AI proposals and agent cycle | `src/state/store.ts` → `runAgentCycle`, `src/lib/proposals.ts` | agent service |
| Assistant replies | `src/lib/assistant.ts` → `respond` | AI backend |
| Seed data | `src/data/seed.ts` | remove once real history exists |

## Design rules baked in

- Submitted is never shown as completed. Transactions show **submission, execution and settlement** as separate lanes.
- Unknown outcomes stay **Unresolved**, with collateral still reserved, until a re-check confirms them.
- Verified, estimated and unavailable pricing are always labelled. Missing prices show "—", never a guess.
- Only long calls and long puts are executable. Spreads and covered strategies show as locked.
- Connecting a wallet grants the agent nothing. Mode, limits, pause and revoke live on the Agent page.
- Testnet and simulated settlement are called out wherever a route is shown.
