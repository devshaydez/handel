# Market data and deterministic pricing — Phase 16 gates

**Status:** Phase 16 is not complete. A deterministic European Black–Scholes reference engine is implemented with explicit unit handling and offline reference tests. No provider is currently approved as an authoritative NEAR execution/risk oracle for Handel's Ondo instruments.

## Ondo API findings

The current official Ondo API documentation exposes:
- Current asset prices and real-time price streaming.
- Historical OHLC data.
- A Soft Attestation Quote endpoint.
- Signed mint/redeem attestations.

Important distinctions:
1. Ondo explicitly labels current-price and OHLC price feeds as display-only and says they are not recommended as an oracle. They must not be used as authoritative execution, collateral, liquidation, or risk prices.
2. The Soft Attestation Quote endpoint returns estimated pricing for UI display and quote validation. Its response is not eligible for on-chain submission and contains no signature or expiry/authentication fields. It is not a binding execution quote or an oracle.
3. Signed mint/redeem attestations authorize those specific token mint/redeem operations; they are not a general-purpose options-pricing oracle.
4. Ondo Stocks is now distributed through NEAR Intents via solver-routed quotes. That is not a native NEP-141 Ondo contract on NEAR and does not itself establish a price oracle. Handel must use the 1Click token registry and solver quotes for the exact route; see `docs/ONDO_NEAR_INTENTS_ROUTE.md`.

Official references:
- [Ondo API overview](https://docs.ondo.finance/api-reference/overview)
- [Current prices and display-only warning](https://docs.ondo.finance/api-reference/assets/get-current-prices-for-all-supported-assets)
- [Soft Attestation Quote semantics](https://docs.ondo.finance/api-reference/attestations/request-a-soft-attestation-quote)
- [Signed mint/redeem attestation](https://docs.ondo.finance/api-reference/attestations/request-a-mint-or-redeem-attestation)

## Required before Phase 16 can close

- Implemented a required `MarketEvidenceVerifier` runtime boundary: every trading proposal must supply an approved source verification method and evidence hash; absent, rejected, or unavailable verification fails closed. This is an interface and enforcement gate, not a live provider adapter.
- Discover exact Ondo asset IDs, decimals and token standards dynamically from the official NEAR Intents `GET /v0/tokens` registry; do not hand-build identifiers.
- Integrate the 1Click `POST /v0/quote` dry-preview path and derive bid/ask from raw `amountIn`/`amountOut` units. Ignore `amountOutUsd` for logic. Obtain a fresh committed quote before any actual execution.
- Add the protected 1Click partner JWT and verify the fee schedule; unauthenticated non-ANY_INPUT quotes add 25 bps.
- Confirm whether the Ondo assets are held as NEP-245 Intents balances; if so, Batch 9's NEP-141 escrow path must be redesigned for the actual supported Intents custody/transfer flow.
- Obtain a source that is contractually and technically approved for authoritative spot/reference prices for that exact route, or wait for Ondo's documented oracle.
- Verify timestamp, market session, stale-data behavior, outlier handling, decimal conversion, USDon/USDC conversion, and source signatures/provenance.
- The reference Black–Scholes engine requires explicit spot, annualized volatility, risk-free rate, dividend yield, and time-to-expiry inputs. It uses 18-decimal Ondo quantity, 6-decimal USDC total strike/premium, a documented European model, and round-up to one USDC minor unit. It is not production-approved until the exact Intents solver quotes, total-return token mechanics, volatility/rate/dividend inputs, and implementation are independently verified against a trusted pricing library/reference suite.
- Keep any Ondo display prices or soft quotes in a separate display/analytics channel; never silently promote them into execution/risk inputs.
- Add tests proving stale, unsigned, wrong-chain, wrong-asset, or unsupported quote data cannot produce a tradable proposal.

## Release rule

Until these requirements are evidenced, the runtime must abstain from live trading when authoritative market inputs or deterministic pricing are unavailable. A market display adapter, a model-generated price, or a soft quote does not satisfy this gate. The current Black–Scholes engine is a deterministic reference implementation only; it must not be connected to live execution until the source and unit assumptions are independently verified.
