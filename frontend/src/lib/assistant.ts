// Scripted assistant. In production this calls the AI backend, which must only
// cite prices and evidence returned by the market-data integrations.
import { assetBySym, ASSETS, dteOf, EXPIRIES, fmtShort, GLOSSARY, makeContract } from '../data/mock';
import type { Block, Contract } from '../data/types';
import type { State } from '../state/store';
import { CONTRACT_SIZE, usd, usd0 } from './pricing';
import { markPosition } from './valuation';

const ATM = (sym: string) => {
  const a = assetBySym(sym)!;
  return Math.round(a.price / a.strikeStep) * a.strikeStep;
};

function termBlock(k: string): Block[] {
  const g = GLOSSARY[k];
  return g ? [{ t: 'term', k }] : [];
}

export function respond(text: string, ctx: { sym?: string; positionId?: string }, s: State): Block[] {
  const q = text.toLowerCase();
  const symMatch = ASSETS.find((a) => new RegExp(`\\b${a.sym.toLowerCase()}\\b`).test(q) || q.includes(a.name.split(' ')[0].toLowerCase()));
  const sym = symMatch?.sym ?? ctx.sym;
  const feedDown = s.demo.feed === 'down';

  if (feedDown && /(analy|opportunit|price|trade|compare|recommend)/.test(q)) {
    return [
      { t: 'p', text: 'Market data is currently unavailable in this demo, so I can’t give you a price-based answer. I won’t estimate prices from memory.' },
      { t: 'p', text: 'I can still explain concepts, such as implied volatility, delta or what happens at expiry. Restore the data feed in Demo controls to continue.' },
    ];
  }

  if (/analy[sz]e|what do you (see|think)|outlook/.test(q) && sym) {
    const a = assetBySym(sym)!;
    return [
      { t: 'p', text: `Here is what the demo data shows for ${a.sym}.` },
      { t: 'analysis', sym },
      { t: 'p', text: a.summary },
    ];
  }

  if (/opportunit|ideas?|what should i (look|trade)|find me/.test(q)) {
    const mk = (symb: string, side: 'call' | 'put', strike: number, headline: string, thesis: string[]) => ({ sym: symb, side, strike, expiry: '2026-12-18', qty: 1, headline, thesis });
    return [
      { t: 'p', text: 'Two setups pass my screen right now. Each is a long option with a known maximum loss. Neither is an instruction to trade.' },
      { t: 'proposal', draft: mk('MSFT', 'call', 490, 'Long call on MSFT 490, 18 Dec', ['Steady uptrend with below-average implied volatility.', 'A modestly out-of-the-money strike keeps premium low.']) },
      { t: 'proposal', draft: mk('NVDA', 'call', 190, 'Long call on NVDA 190, 18 Dec', ['Momentum intact and implied volatility is mid-range.', 'December expiry avoids steep short-term decay.']) },
      { t: 'p', text: 'I’m not recommending TSLA right now, because implied volatility is high and the direction is unclear. AAPL is a no-trade for the same reason in reverse: volatility is too low to justify paying for decay.' },
    ];
  }

  if (/compare/.test(q) && /expir|dec|nov|jan/.test(q)) {
    const target = sym ?? 'NVDA';
    const k = ATM(target) + assetBySym(target)!.strikeStep;
    const a = makeContract(target, EXPIRIES[1], 'call', k);
    const b = makeContract(target, EXPIRIES[2], 'call', k);
    const f = (c: Contract) => (c.ask != null ? usd(c.ask) : 'Unavailable');
    return [
      { t: 'p', text: `Comparing the ${k} call on ${target} for two expiries. The later expiry costs more but loses value more slowly each day.` },
      {
        t: 'compare', sym: target, aTitle: fmtShort(a.expiry), bTitle: fmtShort(b.expiry),
        rows: [
          { label: 'Days to expiry', a: String(a.dte), b: String(b.dte) },
          { label: 'Ask premium', a: f(a), b: f(b) },
          { label: 'Cost per contract', a: a.ask != null ? usd0(a.ask * CONTRACT_SIZE) : '—', b: b.ask != null ? usd0(b.ask * CONTRACT_SIZE) : '—' },
          { label: 'Delta', a: a.delta.toFixed(2), b: b.delta.toFixed(2) },
          { label: 'Theta per day', a: usd(a.theta * CONTRACT_SIZE), b: usd(b.theta * CONTRACT_SIZE) },
          { label: 'Pricing evidence', a: a.quality, b: b.quality },
        ],
      },
      { t: 'p', text: 'If you expect the move within two weeks, the nearer expiry is cheaper per dollar of upside. If you are unsure about timing, the later expiry gives you room to be early.' },
    ];
  }

  if (/risk/.test(q) && (/position|my|this/.test(q))) {
    const pos = s.positions.find((p) => p.id === ctx.positionId) ?? s.positions.find((p) => p.status === 'open');
    if (!pos) return [{ t: 'p', text: 'You have no open positions to review yet. Once you open one, I can walk through its risk: maximum loss, time decay, and what happens at expiry.' }];
    const m = markPosition(pos, s.demo.feed);
    const dte = dteOf(pos.expiry);
    return [
      { t: 'p', text: `${pos.sym} ${pos.strike} ${pos.side}, expiring ${fmtShort(pos.expiry)} (${dte} days):` },
      {
        t: 'list',
        items: [
          `Maximum loss is the premium you paid: ${usd0(m.cost)}. You cannot lose more than this.`,
          m.valued ? `It is currently ${m.itm ? 'in' : 'out of'} the money and marked at ${usd(m.mark ?? 0)} per share (${m.pnl >= 0 ? '+' : ''}${usd0(m.pnl)} unrealized).` : 'A current valuation is not available, so I can’t estimate P&L.',
          dte <= 7 ? 'Expiry is close. Time decay is now the dominant force, and an out-of-the-money option can fall to zero quickly.' : 'Time decay is gradual now but speeds up inside the last 30 days.',
          m.quality === 'estimated' ? 'The valuation is an estimate, not a verified quote.' : 'The valuation uses verified demo pricing.',
        ],
      },
    ];
  }

  if (/(should i|trade or wait|wait or|worth it)/.test(q)) {
    const target = sym ?? 'AAPL';
    const a = assetBySym(target)!;
    if (a.signal === 'opportunity') {
      return [
        { t: 'p', text: `For ${target} the screen currently says there is a setup, but it is not urgent.` },
        { t: 'p', text: a.summary },
        { t: 'p', text: 'If you decide to proceed, the Trade Builder will show the cost, maximum loss and the independent risk checks before anything is signed. Waiting is also a valid choice.' },
      ];
    }
    return [
      { t: 'p', text: `For ${target}, my answer is wait.` },
      { t: 'notrade', sym: target, reasons: a.optionsSupported ? [a.summary, ...a.risks.slice(0, 2)] : ['Options on this asset are not connected, so I have no priced contracts to evaluate.'] },
    ];
  }

  if (/implied vol|\biv\b/.test(q)) {
    return [{ t: 'p', text: 'Implied volatility is the size of move the options market is pricing in.' }, ...termBlock('iv'), { t: 'p', text: 'A practical rule: buying options when IV rank is high means paying up. If IV then falls, you can lose value even when price moves your way.' }];
  }
  if (/delta/.test(q)) return [...termBlock('delta')];
  if (/theta|decay/.test(q)) return [...termBlock('theta'), { t: 'p', text: 'Decay is not linear. It accelerates in the last weeks, which is why short-dated options can lose value quickly.' }];
  if (/gamma/.test(q)) return termBlock('gamma');
  if (/vega/.test(q)) return termBlock('vega');

  if (/(expire|expiry|expires).*(out of the money|otm|worthless)|out of the money/.test(q)) {
    return [
      { t: 'p', text: 'If a long option expires out of the money, it has no value. You lose the premium you paid and nothing more.' },
      { t: 'list', items: ['There is nothing to exercise, so no further action is needed on the market side.', 'In Handel the position moves to “expired”. Request an expiry release to finalise it and free the collateral lock.', 'Your maximum loss was fixed when you opened the trade.'] },
      ...termBlock('otm'),
    ];
  }

  if (/explain.*(call|put)|what is a (call|put)/.test(q)) {
    const side = /put/.test(q) ? 'put' : 'call';
    const target = sym ?? 'NVDA';
    const k = ATM(target) + (side === 'call' ? 1 : -1) * assetBySym(target)!.strikeStep;
    const c = makeContract(target, EXPIRIES[2], side, k);
    return [
      ...termBlock(side),
      {
        t: 'p',
        text: c.ask != null
          ? `Example from the demo chain: the ${target} ${k} ${side} expiring ${fmtShort(c.expiry)} costs ${usd(c.ask)} per share, or ${usd0(c.ask * CONTRACT_SIZE)} per contract. That is also the most you can lose. It breaks even at ${side === 'call' ? usd(k + c.ask) : usd(k - c.ask)}.`
          : `The ${target} ${k} ${side} has no pricing evidence right now, so I can’t give you a cost.`,
      },
    ];
  }

  if (/why.*(recommend|propos|strategy)/.test(q)) {
    const pr = s.proposals.find((p) => p.status === 'pending') ?? s.proposals[0];
    if (!pr) return [{ t: 'p', text: 'There is no recent proposal to explain. Ask me for opportunities and I’ll show my reasoning with the evidence.' }];
    return [
      { t: 'p', text: `On the latest proposal (${pr.headline}):` },
      { t: 'list', items: pr.reasoning },
      { t: 'evidence', items: pr.evidence },
      { t: 'p', text: `Confidence is ${Math.round(pr.confidence * 100)}%. ${pr.uncertainty}` },
    ];
  }

  if (sym && /(price|how is|doing)/.test(q)) {
    const a = assetBySym(sym)!;
    return [{ t: 'p', text: `${a.sym} is at ${usd(a.price)} in the demo feed (previous close ${usd(a.prevClose)}). This is sample data, not a live quote.` }];
  }

  return [
    { t: 'p', text: 'I’m not sure I can answer that with the evidence I have. Here is what I can do well:' },
    { t: 'list', items: ['Analyse an asset: “Analyse NVDA”', 'Find opportunities, or tell you there are none', 'Explain a call, a put, implied volatility, delta or theta', 'Compare two expiries', 'Review the risk of a position you hold', 'Tell you whether to trade or wait'] },
  ];
}

export const SUGGESTIONS = [
  'Analyse NVDA',
  'What options opportunities are available?',
  'Explain a call option',
  'What are the risks of my position?',
  'Compare the 4 Dec and 18 Dec expiries for NVDA',
  'Should I trade or wait on AAPL?',
  'Explain implied volatility',
  'What happens if my option expires out of the money?',
];
