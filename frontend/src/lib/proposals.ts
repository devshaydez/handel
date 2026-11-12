import { assetBySym, EXPIRIES, fmtShort, isoAgo, makeContract, MIN } from '../data/mock';
import type { Evidence, FeedState, Proposal, ProposalStatus, Side } from '../data/types';

export interface BuildOpts {
  id: string;
  sym: string;
  side: Side;
  strike: number;
  expiry: string;
  qty: number;
  origin: 'agent' | 'assistant';
  headline: string;
  thesis: string[];
  createdAgoMin?: number;
  status?: ProposalStatus;
  feed?: FeedState;
  confidence?: number;
}

export function trend20(sym: string) {
  const s = assetBySym(sym)!.series;
  return ((s[s.length - 1] / s[s.length - 21]) - 1) * 100;
}

export function buildProposal(o: BuildOpts): Proposal {
  const a = assetBySym(o.sym)!;
  const c = makeContract(o.sym, o.expiry, o.side, o.strike, o.feed ?? 'ok');
  const ts = isoAgo((o.createdAgoMin ?? 0) * MIN);
  const premium = c.ask ?? c.mid ?? 0;
  const t = trend20(o.sym);
  const evidence: Evidence[] = [
    { label: 'Underlying price', value: `$${a.price.toFixed(2)}`, source: 'Demo market feed', ts, quality: 'simulated' },
    {
      label: 'Option quote (ask)',
      value: c.ask != null ? `$${c.ask.toFixed(2)} ask · $${c.bid!.toFixed(2)} bid` : 'Unavailable',
      source: 'Demo pricing oracle',
      ts,
      quality: c.quality,
    },
    { label: 'Implied volatility', value: `${(c.iv * 100).toFixed(1)}% · IV rank ${a.ivRank}`, source: 'Demo volatility model', ts, quality: 'estimated' },
    { label: '20-day price trend', value: `${t > 0 ? '+' : ''}${t.toFixed(1)}%`, source: 'Demo market feed', ts, quality: 'simulated' },
  ];
  const nextExp = EXPIRIES[Math.min(EXPIRIES.indexOf(o.expiry) + 1, EXPIRIES.length - 1)];
  const alternatives = [
    {
      title: 'Wait for confirmation',
      detail: `Hold off until ${o.sym} closes ${o.side === 'call' ? 'above' : 'below'} the edge of its recent range.`,
      tradeoff: 'Costs nothing if the signal fails, but the entry may be more expensive if it works.',
    },
    {
      title: `Use the ${fmtShort(nextExp)} expiry`,
      detail: 'A later expiry gives the idea more time and slows daily decay.',
      tradeoff: 'Higher premium and more capital reserved.',
    },
    o.qty > 1
      ? { title: 'Trade 1 contract', detail: `Open a single contract instead of ${o.qty}.`, tradeoff: 'Lower capital at risk, proportionally smaller payoff.' }
      : { title: 'Do nothing', detail: 'Skip this idea and keep the collateral free.', tradeoff: 'No risk, no exposure to the move.' },
  ];
  return {
    id: o.id,
    createdAt: ts,
    origin: o.origin,
    sym: o.sym,
    contractId: c.id,
    side: o.side,
    strike: o.strike,
    expiry: o.expiry,
    dte: c.dte,
    qty: o.qty,
    premium,
    quality: c.quality,
    strategy: o.side === 'call' ? 'Long call' : 'Long put',
    headline: o.headline,
    reasoning: o.thesis,
    evidence,
    risks: [
      `The premium of ${(premium * 100 * o.qty).toLocaleString('en-US', { style: 'currency', currency: 'USD' })} is lost if ${o.sym} does not finish ${o.side === 'call' ? 'above' : 'below'} the strike.`,
      ...a.risks.slice(0, 2),
    ],
    alternatives,
    confidence: o.confidence ?? 0.64,
    uncertainty: 'Pricing comes from a demo oracle. Volatility can change after the next catalyst, which would alter the premium.',
    status: o.status ?? 'pending',
  };
}
