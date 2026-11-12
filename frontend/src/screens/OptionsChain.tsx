import { useMemo, useState } from 'react';
import { LuInfo } from 'react-icons/lu';
import { Badge, Banner, Button, Card, CardHead, EmptyState, KV, PageHead, PageSkeleton, QualityBadge, Seg, Sparkle, Term, UnavailableState, useLoading } from '../components/ui';
import { assetBySym, EXPIRIES, fmtDate, fmtShort, getChain, dteOf } from '../data/mock';
import type { Contract } from '../data/types';
import { go, useRoute } from '../router';
import { useStore } from '../state/store';
import { CONTRACT_SIZE, breakeven, usd, usd0 } from '../lib/pricing';

export default function OptionsChain({ sym }: { sym: string }) {
  const s = useStore();
  const r = useRoute();
  const a = assetBySym(sym.toUpperCase());
  const [expiry, setExpiry] = useState(r.query.get('e') && EXPIRIES.includes(r.query.get('e')!) ? r.query.get('e')! : EXPIRIES[2]);
  const [sel, setSel] = useState<Contract | null>(null);
  const [cmp, setCmp] = useState<Contract | null>(null);
  const [comparing, setComparing] = useState(false);
  const [greeks, setGreeks] = useState(true);
  const loading = useLoading(300);
  const chain = useMemo(() => (a ? getChain(a.sym, expiry, s.demo.feed) : []), [a, expiry, s.demo.feed]);
  if (!a) return <div className="page"><EmptyState title="Unknown asset" body="This asset isn’t supported." action={<Button onClick={() => go('/app/markets')}>Back</Button>} /></div>;
  if (!a.optionsSupported) return <div className="page"><PageHead crumbs={[{ label: 'Markets', href: '/app/markets' }, { label: a.sym, href: `/app/markets/${a.sym}` }, { label: 'Options' }]} title={`${a.sym} options`} /><Card><UnavailableState title="Options are not connected" body={`${a.sym} has no supported option instruments or pricing evidence in Handel yet, so there is no chain to show.`} action={<Button onClick={() => go(`/app/markets/${a.sym}`)}>Back to analysis</Button>} /></Card></div>;
  if (loading) return <PageSkeleton />;
  const down = s.demo.feed === 'down';
  const atm = Math.round(a.price / a.strikeStep) * a.strikeStep;
  const pick = (c: Contract) => {
    if (c.quality === 'unavailable') return;
    if (comparing && sel && sel.id !== c.id) { setCmp(c); return; }
    setSel(c); setCmp(null);
  };
  const cell = (c: Contract, key: string, v: string) => <td key={key} className={`cell ${sel?.id === c.id || cmp?.id === c.id ? 'sel' : ''} ${c.quality === 'unavailable' ? 'na' : ''}`} onClick={() => pick(c)}>{v}</td>;
  const px = (v: number | null) => (v == null ? '—' : v.toFixed(2));

  return (
    <div className="page">
      <PageHead crumbs={[{ label: 'Markets', href: '/app/markets' }, { label: a.sym, href: `/app/markets/${a.sym}` }, { label: 'Options' }]} title={`${a.sym} options`} sub={`Underlying ${usd(a.price)}. One contract covers ${CONTRACT_SIZE} shares. Premiums are quoted per share.`} />
      {down && <Banner tone="danger"><b>Option pricing is unavailable.</b> No contract can be selected until market data returns.</Banner>}
      {s.demo.feed === 'stale' && <Banner tone="warn"><b>Quotes are stale.</b> Everything is shown as an estimate, so nothing here is verified.</Banner>}
      <div className="row between wrap gap12">
        <div className="pill-row" role="tablist" aria-label="Expiry">
          {EXPIRIES.map((e) => <button key={e} role="tab" aria-selected={e === expiry} className={`chip ${e === expiry ? 'on' : ''}`} onClick={() => { setExpiry(e); setSel(null); setCmp(null); }}>{fmtShort(e)} <span className="faint">· {dteOf(e)}d</span></button>)}
        </div>
        <div className="row gap12 wrap">
          <label className="row gap8 small muted"><input type="checkbox" className="" checked={greeks} onChange={(e) => setGreeks(e.target.checked)} style={{ accentColor: 'var(--gold)' }} /> Greeks</label>
          <button className={`chip ${comparing ? 'on' : ''}`} onClick={() => { setComparing(!comparing); setCmp(null); }} aria-pressed={comparing}>Compare two contracts</button>
        </div>
      </div>
      <div className="row gap16 wrap small muted" aria-label="Pricing legend">
        <span><i className="q-dot verified" />Verified quote</span><span><i className="q-dot estimated" />Estimate</span><span><i className="q-dot unavailable" />Unavailable</span><span className="ai-tag"><Sparkle size={11} />AI highlight</span>
      </div>
      <div className="grid g-side">
        <Card className="flush">
          <div className="tbl-wrap">
            <table className="tbl chain">
              <thead>
                <tr><th colSpan={greeks ? 6 : 4} style={{ textAlign: 'center', color: 'var(--green)' }}>Calls</th><th /><th colSpan={greeks ? 6 : 4} style={{ textAlign: 'center', color: 'var(--red)' }}>Puts</th></tr>
                <tr>
                  {greeks && <th className="hide-m"><Term k="delta">Delta</Term></th>}{greeks && <th className="hide-m"><Term k="iv">IV</Term></th>}
                  <th><Term k="oi">OI</Term></th><th>Bid</th><th>Ask</th><th>Last</th>
                  <th style={{ textAlign: 'center' }}><Term k="strike">Strike</Term></th>
                  <th>Bid</th><th>Ask</th><th>Last</th><th><Term k="oi">OI</Term></th>{greeks && <th className="hide-m"><Term k="iv">IV</Term></th>}{greeks && <th className="hide-m"><Term k="delta">Delta</Term></th>}
                </tr>
              </thead>
              <tbody>
                {chain.map((row) => {
                  const c = row.call, p = row.put;
                  const itmC = row.strike < a.price, itmP = row.strike > a.price;
                  const flag = (x: Contract) => (x.aiHighlight ? <span className="ai-tag" title={x.aiHighlight}><Sparkle size={11} /></span> : null);
                  return (
                    <tr key={row.strike} className={row.strike === atm ? 'atm' : ''}>
                      {greeks && <td className={`hide-m ${itmC ? 'itm' : ''}`}>{c.quality === 'unavailable' ? '—' : c.delta.toFixed(2)}</td>}
                      {greeks && <td className={`hide-m ${itmC ? 'itm' : ''}`}>{c.quality === 'unavailable' ? '—' : (c.iv * 100).toFixed(0) + '%'}</td>}
                      <td className={itmC ? 'itm' : ''}>{c.quality === 'unavailable' ? '—' : c.oi}</td>
                      {cell(c, 'cb', px(c.bid))}
                      {cell(c, 'ca', px(c.ask))}
                      <td className={`cell ${itmC ? 'itm' : ''} ${c.quality === 'unavailable' ? 'na' : ''}`} onClick={() => pick(c)}><i className={`q-dot ${c.quality}`} />{px(c.mid)}{flag(c)}</td>
                      <td className="k">{row.strike}</td>
                      {cell(p, 'pb', px(p.bid))}
                      {cell(p, 'pa', px(p.ask))}
                      <td className={`cell ${itmP ? 'itm' : ''} ${p.quality === 'unavailable' ? 'na' : ''}`} onClick={() => pick(p)}>{px(p.mid)}<i className={`q-dot ${p.quality}`} style={{ marginLeft: 6, marginRight: 0 }} />{flag(p)}</td>
                      <td className={itmP ? 'itm' : ''}>{p.quality === 'unavailable' ? '—' : p.oi}</td>
                      {greeks && <td className={`hide-m ${itmP ? 'itm' : ''}`}>{p.quality === 'unavailable' ? '—' : (p.iv * 100).toFixed(0) + '%'}</td>}
                      {greeks && <td className={`hide-m ${itmP ? 'itm' : ''}`}>{p.quality === 'unavailable' ? '—' : p.delta.toFixed(2)}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--line)' }} className="tiny faint">Shaded cells are in the money. Click a bid or ask to select a contract. Rows without a quote can’t be selected. Demo pricing from a Black-Scholes model.</div>
        </Card>

        <div className="col gap16">
          {!sel ? (
            <Card><EmptyState icon={<LuInfo size={22} />} title="Select a contract" body="Pick a call or put to see its cost, break-even and risks. Hover underlined terms for plain-language definitions." /></Card>
          ) : (
            <ContractPanel c={sel} other={cmp} price={a.price} onClear={() => { setSel(null); setCmp(null); }} />
          )}
          <Card>
            <CardHead title="Reading the chain" />
            <div className="col gap8 small text2">
              <div>A <Term k="call">call</Term> gains when the price rises. A <Term k="put">put</Term> gains when it falls.</div>
              <div>Further <Term k="otm">out-of-the-money</Term> strikes are cheaper but less likely to pay off.</div>
              <div>Later expiries cost more and lose <Term k="theta">value to time</Term> more slowly.</div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ContractPanel({ c, other, price, onClear }: { c: Contract; other: Contract | null; price: number; onClear: () => void }) {
  const ask = c.ask ?? 0;
  const cost = ask * CONTRACT_SIZE;
  const be = breakeven(c.side, c.strike, ask);
  const itm = c.side === 'call' ? price > c.strike : price < c.strike;
  const trade = (x: Contract) => go(`/app/trade?c=${x.id}`);
  const rows: [string, (x: Contract) => string][] = [
    ['Premium (ask)', (x) => usd(x.ask ?? 0)], ['Cost per contract', (x) => usd0((x.ask ?? 0) * CONTRACT_SIZE)],
    ['Break-even', (x) => usd(breakeven(x.side, x.strike, x.ask ?? 0))], ['Delta', (x) => x.delta.toFixed(2)], ['Theta / day', (x) => usd(x.theta * CONTRACT_SIZE)],
    ['Implied volatility', (x) => (x.iv * 100).toFixed(1) + '%'], ['Days to expiry', (x) => String(x.dte)],
  ];
  if (other) {
    return (
      <Card>
        <CardHead title="Comparison" right={<button className="link small" onClick={onClear}>Clear</button>} />
        <table className="tbl"><thead><tr><th /><th className="r">{c.strike} {c.side}</th><th className="r">{other.strike} {other.side}</th></tr></thead><tbody>
          {rows.map(([l, f]) => <tr key={l}><td className="muted">{l}</td><td className="r num">{f(c)}</td><td className="r num">{f(other)}</td></tr>)}
          <tr><td className="muted">Pricing</td><td className="r"><QualityBadge q={c.quality} /></td><td className="r"><QualityBadge q={other.quality} /></td></tr>
        </tbody></table>
        <div className="row gap8 mt16"><Button block onClick={() => trade(c)}>Trade {c.strike}</Button><Button block onClick={() => trade(other)}>Trade {other.strike}</Button></div>
      </Card>
    );
  }
  return (
    <Card className="glow-gold">
      <CardHead title={<span>{c.sym} {c.strike} {c.side === 'call' ? 'Call' : 'Put'}</span>} sub={`Expires ${fmtDate(c.expiry)} · ${c.dte} days`} right={<QualityBadge q={c.quality} />} />
      {c.aiHighlight && <div className="banner gold" style={{ marginBottom: 12 }}><Sparkle /><div><b>AI:</b> {c.aiHighlight}.</div></div>}
      {c.quality === 'estimated' && <Banner tone="warn">This price is an estimate, not a verified quote. Agent policies requiring verified pricing will block it.</Banner>}
      <div className="mt8">
        <KV k={<Term k="premium">Premium (ask)</Term>} v={usd(ask)} />
        <KV k="Cost per contract" v={usd0(cost)} />
        <KV k={<Term k="collateral">Collateral required</Term>} v={usd0(cost)} />
        <KV k="Maximum loss" v={usd0(cost)} />
        <KV k={<Term k="breakeven">Break-even</Term>} v={usd(be)} />
        <KV k="Status" v={<Badge sm tone={itm ? 'green' : 'outline'}>{itm ? 'In the money' : 'Out of the money'}</Badge>} />
        <KV k={<Term k="bid">Bid / ask</Term>} v={`${c.bid?.toFixed(2)} / ${c.ask?.toFixed(2)}`} />
        <KV k={<Term k="delta">Delta</Term>} v={c.delta.toFixed(2)} />
        <KV k={<Term k="theta">Theta</Term>} v={`${usd(c.theta * CONTRACT_SIZE)}/day`} />
        <KV k={<Term k="iv">IV</Term>} v={(c.iv * 100).toFixed(1) + '%'} />
        <KV k="Contract ID" v={<span className="mono tiny">{c.id}</span>} />
      </div>
      <div className="row gap8 mt16"><Button variant="gold" block onClick={() => trade(c)}>Build trade</Button><Button onClick={onClear}>Clear</Button></div>
    </Card>
  );
}
