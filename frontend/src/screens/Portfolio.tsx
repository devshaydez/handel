import { useEffect, useState } from 'react';
import { Badge, Banner, Button, Card, CardHead, EmptyState, MCard, MStat, PageHead, PageSkeleton, SymBadge, Tabs, Term, useLoading } from '../components/ui';
import { TradeStatus } from '../components/status';
import { fmtShort, dteOf } from '../data/mock';
import type { Position } from '../data/types';
import { go } from '../router';
import { portfolio, useStore } from '../state/store';
import { markPosition } from '../lib/valuation';
import { CONTRACT_SIZE, signedUsd, usd, usd0 } from '../lib/pricing';
import { fetchPortfolioPositions, type IndexedChainPosition } from '../lib/indexer-api';

type Tab = 'open' | 'pending' | 'closed';
export default function Portfolio() {
  const s = useStore();
  const [tab, setTab] = useState<Tab>('open');
  const [chainPositions, setChainPositions] = useState<IndexedChainPosition[]>([]);
  const [chainError, setChainError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (!s.wallet.account) { setChainPositions([]); return () => { active = false; }; }
    fetchPortfolioPositions(s.wallet.account).then(rows => { if (active) { setChainPositions(rows); setChainError(null); } })
      .catch(error => { if (active) setChainError(error instanceof Error ? error.message : 'Indexer unavailable'); });
    return () => { active = false; };
  }, [s.wallet.account]);
  const loading = useLoading(300);
  if (loading) return <PageSkeleton />;
  const pf = portfolio(s);
  const open = s.positions.filter((p) => p.status === 'open' || p.status === 'expired');
  const pend = s.positions.filter((p) => p.status === 'pending' || p.status === 'unresolved' || p.status === 'failed');
  const closed = s.positions.filter((p) => p.status === 'closed');
  const list = tab === 'open' ? open : tab === 'pending' ? pend : closed;
  const winRate = closed.length ? Math.round((closed.filter((p) => (p.realized ?? 0) > 0).length / closed.length) * 100) : 0;

  const stat = (p: Position) => {
    if (p.status === 'pending') return <TradeStatus stage="pending" sm />;
    if (p.status === 'unresolved') return <TradeStatus stage="unknown" sm />;
    if (p.status === 'failed') return <TradeStatus stage="failed" sm />;
    if (p.status === 'expired') return <Badge sm tone="amber">Expired</Badge>;
    if (p.status === 'closed') return <Badge sm tone="outline">{p.closeReason}</Badge>;
    return <Badge sm tone="green">Open</Badge>;
  };

  return (
    <div className="page">
      <PageHead title="Portfolio" sub="Session-visible positions and valuations. Automatic on-chain portfolio indexing is not connected yet." actions={<Button variant="gold" onClick={() => go('/app/markets')}>New trade</Button>} />
      <Card>
        <CardHead title="On-chain Testnet positions" sub={s.wallet.account ? "Indexed from OptionsContract for " + s.wallet.account : "Connect a NEAR Testnet wallet to load your positions"} />
        {chainError && <Banner tone="warn">{chainError}. Session-only records below are not a substitute for chain indexing.</Banner>}
        {chainPositions.length === 0 ? <EmptyState title="No indexed positions returned" body="This section reads persistent OptionsContract snapshots. It does not create demo positions or infer missing balances." /> : (
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Position</th><th>Writer / Holder</th><th>Underlying units</th><th>Strike (USDC)</th><th>Premium (USDC)</th><th>State</th><th>Block</th></tr></thead><tbody>
            {chainPositions.map(row => <tr key={row.contract_id + ":" + row.position_id}>
              <td><div className="semi">#{row.position_id} · {row.payload.kind}</div><div className="tiny muted">{row.payload.asset_id}</div></td>
              <td><div className="tiny">W: {row.writer}</div><div className="tiny">H: {row.holder}</div></td>
              <td className="num">{row.payload.underlying_amount} <span className="tiny muted">(base units)</span></td>
              <td className="num">{(Number(row.payload.strike_amount_usdc) / 1_000_000).toLocaleString()}</td>
              <td className="num">{(Number(row.payload.premium_amount_usdc) / 1_000_000).toLocaleString()}</td>
              <td><Badge tone="outline">{row.state}</Badge></td>
              <td className="num">{row.block_height}</td>
            </tr>)}
          </tbody></table></div>
        )}
        <p className="tiny faint">Finalized contract reads are authoritative for terms and state. No live mark price or P&amp;L is inferred. This direct RPC view needs no paid database; it becomes available once the read-only contract views are deployed.</p>
      </Card>
      <div className="grid g4">
        <MCard title="Open value" tone="gold"><div className="hero-num" style={{ fontSize: 30 }}>{usd0(pf.openValue)}</div><div className="tiny faint">{pf.openCount} position{pf.openCount === 1 ? '' : 's'}</div></MCard>
        <MCard title="Unrealized P&L" tone={pf.unrealized < 0 ? 'neg' : undefined}><div className={`hero-num ${pf.unrealized >= 0 ? 'green' : 'red'}`} style={{ fontSize: 30 }}>{signedUsd(pf.unrealized, 0)}</div></MCard>
        <MCard title="Realized P&L" tone={pf.realized < 0 ? 'neg' : undefined}><div className={`hero-num ${pf.realized >= 0 ? 'green' : 'red'}`} style={{ fontSize: 30 }}>{signedUsd(pf.realized, 0)}</div><div className="tiny faint">{closed.length} closed · {winRate}% winners</div></MCard>
        <MCard title={<Term k="collateral">Collateral</Term>} tone="plain"><div className="mcard-f" style={{ marginTop: 0 }}><MStat sm label="Reserved" value={usd0(pf.locked)} /><MStat sm label="Free" value={usd0(pf.available)} /></div></MCard>
      </div>
      {s.positions.some((p) => p.status === 'unresolved') && <Banner tone="warn"><b>Unresolved positions are not counted as open.</b> Their collateral stays reserved until the outcome is verified. Open them to check again.</Banner>}
      <Tabs value={tab} onChange={setTab} tabs={[{ v: 'open', label: 'Open', n: open.length }, { v: 'pending', label: 'Pending and unresolved', n: pend.length }, { v: 'closed', label: 'Closed', n: closed.length }]} />
      <Card className="flush">
        {list.length === 0 ? (
          <EmptyState title={tab === 'open' ? 'No open positions' : tab === 'pending' ? 'Nothing pending' : 'No closed positions yet'} body={tab === 'open' ? 'The app does not yet query OptionsContract for all positions by writer. This list only shows position records created in the current browser session.' : tab === 'pending' ? 'Submitted trades appear here until the network confirms them.' : 'Positions you close, exercise or let expire show here with their realized P&L.'} action={tab === 'open' ? <Button variant="gold" onClick={() => go('/app/markets')}>Open Assistant</Button> : undefined} />
        ) : (
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Contract</th><th className="r hide-m">Qty</th><th className="r hide-m"><Term k="premium">Entry</Term></th><th className="r"><Term k="mark">{tab === 'closed' ? 'Exit' : 'Mark'}</Term></th><th className="r">{tab === 'closed' ? 'Realized' : 'Unrealized'}</th><th className="r hide-m">Collateral</th><th>Status</th></tr></thead><tbody>
            {list.map((p) => {
              const m = markPosition(p, s.demo.feed);
              const dte = dteOf(p.expiry);
              return (
                <tr key={p.id} className="click" onClick={() => go(`/app/portfolio/${p.id}`)}>
                  <td><div className="row gap12"><SymBadge sym={p.sym} /><div><div className="semi">{p.sym} {p.strike} {p.side}</div><div className="tiny muted">{fmtShort(p.expiry)}{p.status === 'open' && ` · ${dte}d left`}</div></div></div></td>
                  <td className="r num hide-m">{p.qty}</td>
                  <td className="r num hide-m">{usd(p.entryPremium)}</td>
                  <td className="r num">{m.mark != null ? usd(m.mark) : '—'}</td>
                  <td className={`r num semi ${m.pnl >= 0 ? 'green' : 'red'}`}>{m.valued ? signedUsd(m.pnl, 0) : '—'}</td>
                  <td className="r num hide-m">{tab === 'closed' ? '—' : usd0(p.entryPremium * CONTRACT_SIZE * p.qty)}</td>
                  <td>{stat(p)}</td>
                </tr>
              );
            })}
          </tbody></table></div>
        )}
      </Card>
      <p className="tiny faint">Live market pricing is not connected. “—” means no verified quote is available; Handel will not estimate a live mark.</p>
    </div>
  );
}
