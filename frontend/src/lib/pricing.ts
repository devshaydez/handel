// Black-Scholes helpers used ONLY to generate demo option prices and greeks.
export const CONTRACT_SIZE = 100;
const RATE = 0.042;

function pdf(x: number) {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}
function cdf(x: number) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = pdf(x);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}

export type Side = 'call' | 'put';

export interface Greeks {
  price: number;
  delta: number;
  gamma: number;
  theta: number; // per day
  vega: number; // per 1 vol point
}

export function bs(side: Side, S: number, K: number, days: number, iv: number): Greeks {
  const T = Math.max(days, 0) / 365;
  if (T <= 0 || iv <= 0) {
    const intrinsic = side === 'call' ? Math.max(S - K, 0) : Math.max(K - S, 0);
    return { price: intrinsic, delta: intrinsic > 0 ? (side === 'call' ? 1 : -1) : 0, gamma: 0, theta: 0, vega: 0 };
  }
  const sq = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (RATE + 0.5 * iv * iv) * T) / (iv * sq);
  const d2 = d1 - iv * sq;
  const disc = Math.exp(-RATE * T);
  const price = side === 'call' ? S * cdf(d1) - K * disc * cdf(d2) : K * disc * cdf(-d2) - S * cdf(-d1);
  const delta = side === 'call' ? cdf(d1) : cdf(d1) - 1;
  const gamma = pdf(d1) / (S * iv * sq);
  const vega = (S * pdf(d1) * sq) / 100;
  const thetaYear =
    -(S * pdf(d1) * iv) / (2 * sq) - (side === 'call' ? 1 : -1) * RATE * K * disc * cdf(side === 'call' ? d2 : -d2);
  return { price: Math.max(price, 0.01), delta, gamma, theta: thetaYear / 365, vega };
}

export function payoffAtExpiry(side: Side, K: number, spot: number, premium: number) {
  const intrinsic = side === 'call' ? Math.max(spot - K, 0) : Math.max(K - spot, 0);
  return (intrinsic - premium) * CONTRACT_SIZE;
}

export function breakeven(side: Side, K: number, premium: number) {
  return side === 'call' ? K + premium : K - premium;
}

export const usd = (n: number, dp = 2) =>
  (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
export const usd0 = (n: number) => usd(n, 0);
export const signedUsd = (n: number, dp = 2) => (n > 0 ? '+' : '') + usd(n, dp);
export const pct = (n: number, dp = 1) => (n > 0 ? '+' : '') + n.toFixed(dp) + '%';
