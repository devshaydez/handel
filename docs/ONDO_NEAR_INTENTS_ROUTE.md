# Ondo Stocks through NEAR Intents — route and custody requirements

**Status:** The Ondo/NEAR integration exists, but Handel has not yet verified the live 1Click asset registry, quotes, or final execution/custody route.

## Confirmed integration model

Ondo announced that Ondo Stocks became available through near.com and NEAR Intents on 22 September 2026, initially across 20 assets. This is a solver-routed distribution path; it does not mean every Ondo asset is a native NEP-141 token contract on NEAR.

The NEAR Intents 1Click API is the documented integration surface:
- `GET /v0/tokens` discovers supported `assetId`, blockchain, symbol, decimals, and contract metadata. Always use the returned exact `assetId`; never construct one by hand.
- `POST /v0/quote` with `dry: true` previews a solver quote without creating a deposit address.
- `POST /v0/quote` with `dry: false` commits a quote and returns a quote-specific deposit address with a limited validity window.
- `GET /v0/status` tracks completion/refund.

A 1Click quote is a market-maker execution quote, not a general-purpose oracle. Use raw `amountIn` and `amountOut` in their respective token base units for calculations. The API explicitly marks `amountOutUsd` as display-only; never use it in risk or pricing logic. A dry quote is indicative; execution must obtain a fresh committed quote and enforce its deadline/slippage.

## Fees and credentials

Unauthenticated non-`ANY_INPUT` quotes incur an additional 25 bps fee. Authenticated partner JWTs use a lower partner fee schedule (typically 20 bps, with special cases). Handel should keep a 1Click JWT in a protected runtime secret and never commit it. Do not silently accept the unauthenticated fee schedule for live trading.

## Asset identity and pricing assumptions

- The token registry is the source of truth for the exact NEAR Intents asset IDs and decimals.
- Verify the issuer, underlying ticker, and total-return mechanics for each returned token before allowing it.
- Ondo states that token units may not equal one underlying share; for example, its NVDAon page reports a shares-per-token ratio. Use the actual solver quote in token units, not a generic equity feed multiplied by an assumed 1:1 ratio.
- Ondo's own displayed price data is illustrative and not a guaranteed buy/sell price.
- Black–Scholes needs volatility, rate and dividend/total-return assumptions in addition to spot. A live 1Click quote alone does not supply a complete, independently validated option-pricing surface.

## Custody and settlement architecture impact

NEAR Intents maintains a verifier-controlled token ledger. Ondo stock exposure routed through Intents may be held as a NEP-245 Intents balance rather than as a standalone NEP-141 token balance in an ordinary NEAR account. The exact live `assetId` and token standard must be verified from `/v0/tokens` before designing collateral custody.

**Do not assume the current Batch 9 NEP-141 `ft_transfer_call` escrow path can custody Ondo collateral.** If the verified asset is an Intents/NEP-245 balance, custody, position reservation, exercise and payout must use a supported Intents authorization/transfer route or another issuer-approved custody design. A contract cannot spend a user's Intents balance merely because the user holds it in the verifier ledger.

## Release gates

1. Fetch and archive the live `/v0/tokens` response; verify NVDAon, TSLAon, AAPLon and SPYon IDs, decimals, issuer metadata, and token standard.
2. Obtain the protected 1Click partner JWT and record the actual fee schedule.
3. Obtain dry buy and sell quotes for each asset with minimum supported notional; derive bid/ask from raw base-unit amounts and record timestamps, quote IDs and deadlines.
4. Verify quote staleness, market-session pauses, liquidity/minimum order size, spread, slippage and outlier rejection.
5. Obtain an approved volatility/rate/dividend source and independent pricing reference vectors.
6. Rework Batch 9 custody if the returned assets are NEP-245 Intents balances; demonstrate collateral reservation and settlement through the exact supported route.
7. Test the actual mainnet-only route with explicit small-value owner approval. Tidepool is a community test environment and does not prove the live Ondo route.

## Official references

- [Ondo: Ondo Stocks goes live on near.com and NEAR Intents](https://ondo.finance/blog/ondo-stocks-go-live-on-near)
- [NEAR Intents 1Click quote API](https://github.com/near/agent-skills/blob/main/skills/near-intents/rules/api-quote.md)
- [NEAR Intents API keys and fee schedule](https://docs.agentsonintents.com/integration/distribution-channels/1click-api/authentication)
- [NEAR Intents 1Click lifecycle](https://github.com/near/agent-skills/blob/main/skills/near-intents/references/concepts.md)
- [Ondo NVDAon token mechanics and shares-per-token ratio](https://app.ondo.finance/assets/nvdaon)
