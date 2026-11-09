import { ONDO_DECIMALS, USDC_DECIMALS } from "./assets.js";
import type { MarketSnapshot } from "./market-context.js";
import type { PremiumEngine, PremiumQuote } from "./agent-runtime.js";

export interface PricingMarketSnapshot extends MarketSnapshot {
  /** Annualized volatility as a decimal fraction, e.g. "0.35" for 35%. */
  annualizedVolatility: string;
  /** Continuously compounded annual risk-free rate as a decimal fraction. */
  riskFreeRate: string;
  /** Annualized continuous dividend yield as a decimal fraction. */
  dividendYield: string;
  volatilitySource: string;
  volatilityObservedAt: string;
}
const YEAR_SECONDS = 365.25 * 24 * 60 * 60;
const MAX_SAFE_MINOR_UNITS = BigInt(Number.MAX_SAFE_INTEGER);

function cdf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return 0.5 * (1 + sign * erf);
}
function numeric(value: string, name: string): number {
  if (!/^-?\d+(?:\.\d+)?$/.test(value)) throw new Error(name + " must be a decimal string");
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(name + " is outside the supported numeric range");
  return result;
}

/**
 * Deterministic European Black–Scholes reference engine.
 *
 * Unit contract: spotPrice is integer micro-USDC per whole Ondo token;
 * quantity is 18-decimal token base units; strike is total USDC collateral/
 * notional in 6-decimal USDC base units; output premium is total 6-decimal USDC.
 * The on-chain contract remains authoritative. This engine is not a quote oracle.
 */
export class BlackScholesPremiumEngine implements PremiumEngine {
  constructor(private readonly clock: () => number = Date.now) {}

  quote(input: {
    type: "Call" | "Put";
    assetId: string;
    quantity: string;
    strike: string;
    expiryNs: string;
    market: MarketSnapshot;
  }): PremiumQuote {
    const market = input.market as PricingMarketSnapshot;
    if (!/^\d+$/.test(input.quantity) || !/^\d+$/.test(input.strike) ||
        !/^\d+$/.test(market.spotPrice)) throw new Error("quantity, strike and spot price must be unsigned integer base units");
    const quantityBase = BigInt(input.quantity);
    const strikeTotal = BigInt(input.strike);
    const spotMinor = BigInt(market.spotPrice);
    if (quantityBase <= 0n || strikeTotal <= 0n || spotMinor <= 0n) throw new Error("pricing inputs must be positive");
    if (quantityBase > 10n ** 30n || strikeTotal > MAX_SAFE_MINOR_UNITS || spotMinor > MAX_SAFE_MINOR_UNITS) {
      throw new Error("pricing inputs exceed deterministic Number precision bounds");
    }
    if (input.assetId !== market.assetId || !market.source?.trim() || !market.volatilitySource?.trim()) {
      throw new Error("pricing market provenance or asset identity is missing");
    }
    const nowMs = this.clock();
    const spotTime = Date.parse(market.observedAt);
    const volatilityTime = Date.parse(market.volatilityObservedAt);
    if (!Number.isFinite(nowMs) || !Number.isFinite(spotTime) || !Number.isFinite(volatilityTime) ||
        spotTime > nowMs + 30_000 || volatilityTime > nowMs + 30_000 ||
        nowMs - spotTime > 300_000 || nowMs - volatilityTime > 300_000) {
      throw new Error("spot or volatility input is stale or has an invalid timestamp");
    }
    const sigma = numeric(market.annualizedVolatility, "annualizedVolatility");
    const rate = numeric(market.riskFreeRate, "riskFreeRate");
    const dividend = numeric(market.dividendYield, "dividendYield");
    if (sigma <= 0 || sigma > 5 || rate < -0.1 || rate > 1 || dividend < 0 || dividend > 1) {
      throw new Error("volatility or rate assumption is outside the supported range");
    }
    const expiryNs = BigInt(input.expiryNs);
    const nowNs = BigInt(Math.trunc(nowMs)) * 1_000_000n;
    if (expiryNs <= nowNs) throw new Error("option expiry must be in the future");
    const years = Number(expiryNs - nowNs) / 1e9 / YEAR_SECONDS;
    if (!Number.isFinite(years) || years <= 0 || years > 20) throw new Error("time to expiry is outside the supported range");

    const quantityTokens = Number(quantityBase) / 10 ** ONDO_DECIMALS;
    const spotPerToken = Number(spotMinor);
    const strikePerToken = Number(strikeTotal) / quantityTokens;
    if (!Number.isFinite(quantityTokens) || quantityTokens <= 0 ||
        !Number.isFinite(spotPerToken) || !Number.isFinite(strikePerToken) || strikePerToken <= 0) {
      throw new Error("option terms cannot be represented safely by the pricing engine");
    }

    const sqrtT = Math.sqrt(years);
    const sigmaSqrtT = sigma * sqrtT;
    const d1 = (Math.log(spotPerToken / strikePerToken) + (rate - dividend + 0.5 * sigma * sigma) * years) / sigmaSqrtT;
    const d2 = d1 - sigmaSqrtT;
    const discountRate = Math.exp(-rate * years);
    const discountDividend = Math.exp(-dividend * years);
    const perToken = input.type === "Call"
      ? spotPerToken * discountDividend * cdf(d1) - strikePerToken * discountRate * cdf(d2)
      : strikePerToken * discountRate * cdf(-d2) - spotPerToken * discountDividend * cdf(-d1);
    if (!Number.isFinite(perToken) || perToken < 0) throw new Error("Black–Scholes produced an invalid premium");
    const totalMinor = Math.ceil(perToken * quantityTokens);
    if (!Number.isSafeInteger(totalMinor) || totalMinor <= 0) throw new Error("premium is below precision or exceeds safe integer range");

    return {
      premium: BigInt(totalMinor).toString(),
      source: "handel:black-scholes-reference-v1",
      calculatedAt: new Date(nowMs).toISOString(),
      methodology: `European Black-Scholes ${input.type}; spot micro-USDC/token; strike total micro-USDC; quantity ${ONDO_DECIMALS} decimals; output ${USDC_DECIMALS}-decimal USDC; sigma=${sigma}; r=${rate}; q=${dividend}; round-up to 1 micro-USDC`,
    };
  }
}
