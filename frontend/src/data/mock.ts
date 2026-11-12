// ─────────────────────────────────────────────────────────────
// MOCK DATA LAYER
// Everything here is invented for the demo. When the backend is ready,
// replace the functions exported from this file (getAssets, getChain, …)
// and the actions in src/state/store.ts with real API calls.
// ─────────────────────────────────────────────────────────────
import { bs } from '../lib/pricing';
import type { Asset, Contract, DataQuality, FeedState, Policy } from './types';

export const DEMO_NOW = Date.UTC(2026, 10, 11, 9, 41, 0);
export const DAY = 86400000;
export const isoAgo = (ms: number) => new Date(DEMO_NOW - ms).toISOString();
export const MIN = 60000;

export const NETWORK = 'NEAR Testnet (demo)';
export const ROUTE = {
  name: 'Handel options contract · NEAR Testnet',
  settlement: 'USDC settlement via NEAR Intents (simulated)',
  note: 'Testnet and simulated settlement. This does not demonstrate real-asset custody.',
};

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeSeries(seed: number, end: number, drift: number, vol: number, n = 90) {
  const r = mulberry32(seed);
  const raw: number[] = [100];
  for (let i = 1; i < n; i++) raw.push(raw[i - 1] * (1 + drift + (r() - 0.5) * vol));
  const k = end / raw[n - 1];
  return raw.map((v) => +(v * k).toFixed(2));
}

const newsTs = (m: number) => isoAgo(m * MIN);

const BASE: Omit<Asset, 'series' | 'prevClose'>[] = [
  {
    sym: 'NVDA', name: 'NVIDIA Corp.', sector: 'Semiconductors', price: 184.2, hv30: 0.46, iv: 0.52, ivRank: 58,
    signal: 'opportunity', optionsSupported: true, strikeStep: 5,
    summary: 'Momentum is intact and implied volatility sits mid-range, so a defined-risk long call is reasonably priced. Short-dated contracts carry heavy time decay, so the December expiry is the better fit.',
    bull: 'A break above the recent range high with rising volume would put the 190 strike in the money well before expiry.',
    bear: 'A pullback to the 50-day average would erode the premium quickly. Time decay accelerates inside 30 days.',
    risks: ['Premium can fall to zero if price stays below the strike at expiry.', 'Implied volatility could contract after the next catalyst.', 'Wide spreads on far strikes make exits costly.'],
    news: [
      { title: 'Sample headline: Data-centre spending commentary lifts chip-sector sentiment', source: 'Demo newswire', ts: newsTs(48) },
      { title: 'Sample headline: Analysts debate supply constraints heading into year-end', source: 'Demo newswire', ts: newsTs(190) },
      { title: 'Sample headline: Options volume skews to calls in large-cap tech', source: 'Demo flow desk', ts: newsTs(420) },
    ],
  },
  {
    sym: 'AAPL', name: 'Apple Inc.', sector: 'Consumer hardware', price: 231.5, hv30: 0.22, iv: 0.24, ivRank: 14,
    signal: 'no-trade', optionsSupported: true, strikeStep: 5,
    summary: 'Volatility is near its 12-month low and price is range-bound. Option premiums are cheap, but there is no catalyst or trend to justify paying for time decay.',
    bull: 'A decisive move out of the 6-week range would justify a directional trade.',
    bear: 'Continued sideways drift lets time decay erase most of any long option premium.',
    risks: ['No clear trend signal.', 'Low volatility means small moves, so premium may not pay back.', 'Pricing evidence for far strikes is estimated only.'],
    news: [
      { title: 'Sample headline: Services revenue steady, hardware cycle quiet', source: 'Demo newswire', ts: newsTs(95) },
      { title: 'Sample headline: Implied volatility drifts to a 12-month low', source: 'Demo flow desk', ts: newsTs(310) },
    ],
  },
  {
    sym: 'MSFT', name: 'Microsoft Corp.', sector: 'Software', price: 478.3, hv30: 0.2, iv: 0.27, ivRank: 33,
    signal: 'opportunity', optionsSupported: true, strikeStep: 10,
    summary: 'Steady uptrend with below-average implied volatility. A modest out-of-the-money call for mid-December offers asymmetric payoff at a premium that fits conservative limits.',
    bull: 'Continuation of the trend toward the prior high turns a 490 call into a profitable trade with time to spare.',
    bear: 'A flat month loses premium to decay. Large-cap software tends to move slowly.',
    risks: ['Slow-moving underlying, so premium decay can outpace price gain.', 'Single-leg long options have no downside hedge.'],
    news: [
      { title: 'Sample headline: Cloud growth commentary supports earnings expectations', source: 'Demo newswire', ts: newsTs(70) },
      { title: 'Sample headline: Enterprise software budgets hold steady', source: 'Demo newswire', ts: newsTs(260) },
    ],
  },
  {
    sym: 'TSLA', name: 'Tesla Inc.', sector: 'Automotive', price: 352.8, hv30: 0.58, iv: 0.64, ivRank: 71,
    signal: 'watch', optionsSupported: true, strikeStep: 10,
    summary: 'Implied volatility is elevated, so premiums are expensive relative to history. Direction is unclear. The AI is watching rather than recommending a trade.',
    bull: 'A trend resumption would reward long calls, but the premium already prices in a large move.',
    bear: 'Volatility contraction hurts long options even when price moves the right way.',
    risks: ['High implied volatility makes long options costly.', 'Large intraday swings can trigger fast losses.', 'Wide bid-ask spreads.'],
    news: [
      { title: 'Sample headline: Delivery estimates diverge across analysts', source: 'Demo newswire', ts: newsTs(130) },
      { title: 'Sample headline: Options implied move widens for the coming month', source: 'Demo flow desk', ts: newsTs(350) },
    ],
  },
  {
    sym: 'AMZN', name: 'Amazon.com Inc.', sector: 'E-commerce and cloud', price: 224.1, hv30: 0.31, iv: 0.35, ivRank: 41,
    signal: 'watch', optionsSupported: true, strikeStep: 5,
    summary: 'Price is consolidating below resistance. Volatility is mid-range. The AI will reconsider if price closes above the consolidation high.',
    bull: 'A breakout from consolidation would favour calls with 4–6 weeks to expiry.',
    bear: 'Failure at resistance could send price back to the lower band of the range.',
    risks: ['Range-bound price action.', 'Moderate liquidity on far strikes.'],
    news: [
      { title: 'Sample headline: Holiday-quarter demand expectations edge higher', source: 'Demo newswire', ts: newsTs(110) },
    ],
  },
  {
    sym: 'META', name: 'Meta Platforms Inc.', sector: 'Internet platforms', price: 612.4, hv30: 0.33, iv: 0.38, ivRank: 47,
    signal: 'opportunity', optionsSupported: true, strikeStep: 10,
    summary: 'Price has stalled after a strong run and momentum indicators are rolling over. A protective-style long put could profit from a pullback with a capped, known cost.',
    bull: 'If momentum re-accelerates the put loses its premium. This is the main way the trade fails.',
    bear: 'A 5–8% pullback would put the 590 put in the money with time remaining.',
    risks: ['Counter-trend trade: the broader trend is still up.', 'Full premium is lost if price holds above the strike.', 'Large premium per contract.'],
    news: [
      { title: 'Sample headline: Ad-spend indicators mixed into the holiday season', source: 'Demo newswire', ts: newsTs(85) },
      { title: 'Sample headline: Momentum indicators roll over from highs', source: 'Demo flow desk', ts: newsTs(280) },
    ],
  },
  {
    sym: 'GOOGL', name: 'Alphabet Inc.', sector: 'Internet platforms', price: 198.7, hv30: 0.28, iv: 0.3, ivRank: 36,
    signal: 'none', optionsSupported: false, strikeStep: 5,
    summary: 'Analysis only. Options on this underlying are not yet connected to Handel, so the AI can describe the market but cannot propose or price a contract.',
    bull: 'Not evaluated for options.',
    bear: 'Not evaluated for options.',
    risks: ['No supported options instruments or pricing evidence for this asset.'],
    news: [{ title: 'Sample headline: Search advertising growth in line with expectations', source: 'Demo newswire', ts: newsTs(200) }],
  },
];

const SEEDS: Record<string, [number, number]> = { NVDA: [11, 0.0016], AAPL: [23, 0.0003], MSFT: [37, 0.0008], TSLA: [41, 0.0012], AMZN: [53, 0.0006], META: [67, 0.0004], GOOGL: [79, 0.0007] };
const PREV: Record<string, number> = { NVDA: 181.4, AAPL: 232.3, MSFT: 475.1, TSLA: 347.2, AMZN: 225.0, META: 618.9, GOOGL: 197.6 };

export const ASSETS: Asset[] = BASE.map((a) => ({
  ...a,
  prevClose: PREV[a.sym],
  series: makeSeries(SEEDS[a.sym][0], a.price, SEEDS[a.sym][1], a.hv30 * 0.1),
}));

export const assetBySym = (sym: string) => ASSETS.find((a) => a.sym === sym);

export const EXPIRIES = ['2026-11-20', '2026-12-04', '2026-12-18', '2027-01-15'];
export const dteOf = (iso: string) => Math.round((Date.parse(iso + 'T21:00:00Z') - DEMO_NOW) / DAY);
export const fmtDate = (iso: string) =>
  new Date(iso.length === 10 ? iso + 'T12:00:00Z' : iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
export const fmtShort = (iso: string) =>
  new Date(iso.length === 10 ? iso + 'T12:00:00Z' : iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';
export const fmtStamp = (iso: string) => fmtShort(iso) + ', ' + fmtTime(iso);

export const contractId = (sym: string, expiry: string, side: 'call' | 'put', strike: number) =>
  `${sym}-${expiry.replace(/-/g, '')}-${side === 'call' ? 'C' : 'P'}-${strike}`;

export function parseContractId(id: string) {
  const [sym, e, s, k] = id.split('-');
  return { sym, expiry: `${e.slice(0, 4)}-${e.slice(4, 6)}-${e.slice(6, 8)}`, side: s === 'C' ? ('call' as const) : ('put' as const), strike: Number(k) };
}

function hash(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

const HIGHLIGHTS: Record<string, string> = {
  'NVDA-20261218-C-190': 'Best fit for the current trend and volatility',
  'MSFT-20261218-C-490': 'Premium fits conservative limits',
  'META-20261218-P-590': 'Defined-risk pullback trade',
};

export function makeContract(sym: string, expiry: string, side: 'call' | 'put', strike: number, feed: FeedState = 'ok'): Contract {
  const a = assetBySym(sym)!;
  const dte = dteOf(expiry);
  const m = strike / a.price - 1;
  const termAdj = dte < 14 ? 0.03 : dte > 45 ? -0.02 : 0;
  const iv = Math.max(0.08, a.iv + termAdj + 0.35 * m * m * 4 + (side === 'put' && m < 0 ? 0.03 : 0));
  const g = bs(side, a.price, strike, dte, iv);
  const id = contractId(sym, expiry, side, strike);
  const h = hash(id);
  const am = Math.abs(m);
  let quality: DataQuality = am <= 0.06 ? 'verified' : am <= 0.12 ? (h % 3 === 0 ? 'estimated' : 'verified') : h % 4 === 0 ? 'unavailable' : 'estimated';
  if (feed === 'stale' && quality === 'verified') quality = 'estimated';
  if (feed === 'down') quality = 'unavailable';
  const spreadPct = quality === 'verified' ? 0.025 : 0.06;
  const spread = Math.max(0.05, g.price * spreadPct);
  const unavailable = quality === 'unavailable';
  const bid = unavailable ? null : +Math.max(0.01, g.price - spread / 2).toFixed(2);
  const ask = unavailable ? null : +(g.price + spread / 2).toFixed(2);
  return {
    id, sym, side, strike, expiry, dte,
    bid, ask, mid: unavailable ? null : +g.price.toFixed(2),
    iv, delta: g.delta, gamma: g.gamma, theta: g.theta, vega: g.vega,
    oi: Math.round((1800 * Math.exp(-am * 9)) * (0.6 + (h % 40) / 50)),
    volume: Math.round((620 * Math.exp(-am * 10)) * (0.5 + (h % 31) / 40)),
    quality, aiHighlight: HIGHLIGHTS[id],
  };
}

export interface ChainRow { strike: number; call: Contract; put: Contract }
export function getChain(sym: string, expiry: string, feed: FeedState = 'ok'): ChainRow[] {
  const a = assetBySym(sym)!;
  const atm = Math.round(a.price / a.strikeStep) * a.strikeStep;
  const rows: ChainRow[] = [];
  for (let i = -5; i <= 5; i++) {
    const strike = atm + i * a.strikeStep;
    rows.push({ strike, call: makeContract(sym, expiry, 'call', strike, feed), put: makeContract(sym, expiry, 'put', strike, feed) });
  }
  return rows;
}

export const DEFAULT_POLICY: Policy = {
  assets: ['NVDA', 'AAPL', 'MSFT', 'AMZN', 'META'],
  sides: ['call', 'put'],
  strategies: ['Long call', 'Long put'],
  maxContracts: 5,
  maxPremiumUsd: 2000,
  expiryMinDays: 3,
  expiryMaxDays: 60,
  maxExposurePct: 40,
  requireVerified: true,
  maxPricingAgeMin: 15,
};

export const SUPPORTED_STRATEGIES = ['Long call', 'Long put'];
export const UNSUPPORTED_STRATEGIES = ['Call spread', 'Put spread', 'Cash-secured put', 'Covered call'];

export const GLOSSARY: Record<string, { title: string; body: string }> = {
  call: { title: 'Call option', body: 'The right, not the obligation, to buy the underlying at the strike price before expiry. It gains value when the price rises.' },
  put: { title: 'Put option', body: 'The right, not the obligation, to sell the underlying at the strike price before expiry. It gains value when the price falls.' },
  strike: { title: 'Strike price', body: 'The price at which the option can be exercised. Compare it with the current price to see how far the market needs to move.' },
  expiry: { title: 'Expiry', body: 'The date the option stops existing. After that it has no value, unless it finished in the money and was exercised.' },
  premium: { title: 'Premium', body: 'The price of the option, quoted per share. One contract covers 100 shares, so multiply by 100 for the cost per contract.' },
  collateral: { title: 'Collateral', body: 'Funds Handel reserves for the position. For a long option this equals the premium, which is also the most you can lose.' },
  breakeven: { title: 'Break-even', body: 'The underlying price at expiry where you neither gain nor lose. For a call it is strike + premium; for a put it is strike − premium.' },
  iv: { title: 'Implied volatility', body: 'How large a price move the market is pricing in. Higher IV makes options more expensive, and a fall in IV can reduce value even if price moves your way.' },
  ivrank: { title: 'IV rank', body: 'Where today’s implied volatility sits in its 12-month range. 0 is the lowest, 100 is the highest. A high rank means options are expensive.' },
  delta: { title: 'Delta', body: 'How much the option price moves for a $1 move in the underlying. It is also a rough estimate of the chance of finishing in the money.' },
  gamma: { title: 'Gamma', body: 'How fast delta changes as the price moves. High gamma means the option’s sensitivity shifts quickly.' },
  theta: { title: 'Theta', body: 'How much value the option loses each day from time passing, all else equal.' },
  vega: { title: 'Vega', body: 'How much the option price changes for a 1-point move in implied volatility.' },
  itm: { title: 'In the money', body: 'A call is in the money when the price is above the strike, and a put when it is below. It has intrinsic value.' },
  otm: { title: 'Out of the money', body: 'A call is out of the money when the price is below the strike, and a put when it is above. It has no intrinsic value, so at expiry it is worth zero.' },
  exercise: { title: 'Exercise', body: 'Using your right to settle the option at the strike. Only worthwhile when the option is in the money.' },
  release: { title: 'Expiry release', body: 'After expiry, a release request finalises the position and frees any collateral still locked to it.' },
  bid: { title: 'Bid / ask', body: 'The bid is what buyers will pay; the ask is what sellers want. You buy at the ask. A wide gap means higher trading cost.' },
  mark: { title: 'Mark', body: 'The current estimated value of the position, based on the latest available pricing evidence.' },
  oi: { title: 'Open interest', body: 'The number of contracts currently open. Higher numbers usually mean easier trading.' },
};
