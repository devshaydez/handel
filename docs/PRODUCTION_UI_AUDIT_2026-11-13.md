# Production UI audit — 2026-11-13

## Scope

Read-only browser audit of https://handel-live.vercel.app/ and source audit of the merged `main` branch after PR #28. Navigation, page routes, visible tabs, safe disclosures and footer destinations were explored. No wallet was connected, no private credentials were entered, no transaction was signed, and no Testnet state was changed.

## Confirmed production findings

- Market screens displayed generated equity prices, Black–Scholes option chains, sample news and hard-coded AI recommendations for NVDA, AAPL, MSFT, TSLA and other symbols. These are not connected market instruments.
- Dashboard showed `NaN%` current exposure when the wallet balance was zero.
- Agent screen contained a literal `undefined` before the revoke modal.
- Production UI exposed demo controls for fabricated account data, market feed state, transaction outcomes and agent health.
- The Agent page mixed browser-local advisory preferences with actual on-chain policy limits, making the authority boundary unclear.
- Pause/resume controls changed only browser state rather than the OptionsContract execution mode.
- Settings showed local policy preferences as if they were current account authority.
- The landing footer contained inert links and a nonfunctional newsletter form; its API reference destination was not a working API documentation page.
- Portfolio and Activity were not backed by a persistent on-chain indexer. Activity is browser-session state; portfolio data is not reconstructed from all OptionsContract positions.
- The Assistant's delegated Testnet flow is the active writer-side Call/Put path. The premium is a fixed demo fixture, not a market quote. The restricted key cannot transfer collateral or premium.

## Changes in this audit branch

- Added the browser `Buffer` polyfill used by NEAR wallet-selector dependencies.
- Prevented division by zero from rendering `NaN%` exposure.
- Removed the stray `undefined` token from the Agent screen.
- Removed production Demo controls from the application shell and Settings.
- Replaced mock market tables, generated asset details, generated option chains and the legacy quote-driven Trade Builder with explicit Testnet-scope and unavailable-feed states.
- Removed synthetic dashboard performance charts, hard-coded market summaries and mock watchlist prices.
- Retired the disconnected legacy Proposals page from primary navigation and directed it to the Assistant.
- Changed Agent pause/resume to wallet-signed OptionsContract execution-mode changes, with post-transaction read-back. A disabled policy is no longer displayed as automatic authority.
- Marked browser-local advisory preferences as non-authoritative and separated them from on-chain policy limits.
- Removed stale local policy claims from Settings; Settings now directs users to the chain-backed Agent screen.
- Corrected landing-page product claims and replaced inert footer links with real documentation, API-documentation and health destinations. Removed nonfunctional newsletter and placeholder social links.
- Updated Activity and Portfolio empty states to disclose their indexing/persistence limitations.
- Recorded successful delegated trade and collateral transaction receipts in the current browser-session Activity journal.
- Replaced stock-demo Assistant suggestions with the actual Testnet execution scope.

## Remaining integration work / release gates

1. **Live market data is not connected.** There is no verified provider for underlying spot prices, option bid/ask, implied volatility, historical series or news. These features must remain unavailable; do not reintroduce generated prices as live data.
2. **Portfolio indexing is not connected.** The frontend does not yet query and reconstruct all writer positions from OptionsContract. Activity remains session-local and is cleared on reload.
3. **Premium is a fixed Testnet demo fixture.** This is not a live market quote and must not be represented as a market-priced order.
4. **Wallet end-to-end tests were not run.** A principal wallet must authorize the on-chain policy, and the holder must sign premium. No one else can substitute for those wallet signatures.
5. **Live Testnet policy preflight was previously blocked.** The last recorded read-only preflight reported `policy=null` and `ManualApproval` for `handel-agent.shaydez.testnet`. The restricted FunctionCall key was installed and correctly scoped, but automatic execution remains off until the principal creates/enables the policy.
6. **Production deployment was not attempted.** The previous Vercel production deploy hit the daily free deployment quota. This branch must pass CI and be reviewed before a deployment is attempted.

## Browser audit results

The landing page, connect/onboarding, dashboard, markets, portfolio, Assistant, legacy Proposals, Agent, Activity, Settings, and footer routes were visited. Safe tabs and disclosures were exercised. The original footer's API-reference path returned 404. The dashboard's zero-balance exposure rendered `NaN%`. Wallet connection, signing, trade creation, collateral funding, premium payment, pause/revoke wallet actions and any transaction-producing controls were intentionally not invoked; they require wallet authorization and cannot be certified by a read-only audit.
