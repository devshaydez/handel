import { useState } from 'react';
import { Badge, Banner, Button, Card, CardHead, EmptyState, PageHead, PageSkeleton, SymBadge, Tabs, useLoading } from '../components/ui';
import { TradeStatus } from '../components/status';
import { fmtShort, dteOf } from '../data/mock';
import type { Position } from '../data/types';
import { go } from '../router';
import { useStore } from '../state/store';
import { markPosition } from '../lib/valuation';
import { CONTRACT_SIZE, signedUsd, usd } from '../lib/pricing';

type Tab = 'open' | 'pending' | 'closed';
export default function Portfolio() {
  const s = useStore();
  const [tab, setTab] = useState<Tab>('open');
  const loading = useLoading(300);
  if (loading) return <PageSkeleton />;
  const open = s.positions.filter((p) => p.status === 'open' || p.status === 'expired');
  const pend = s.positions.filter((p) => p.status === 'pending' || p.status === 'unresolved' || p.status === 'failed');
  const closed = s.positions.filter((p) => p.status === 'closed');
  const list = tab === 'open' ? open : tab === 'pending' ? pend : closed;

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
      <PageHead title="Portfolio" sub="Testnet position activity recorded by this browser session." actions={<Button variant="gold" onClick={() => go('/app/markets')}>New trade</Button>} />
      <Banner tone="warn"><b>Session records, not a persistent chain index.</b> This list contains trades recorded in this browser session. It is not a complete on-chain portfolio; marks and P&L use simulated market data. Verify each position against the Testnet contracts before treating it as current.</Banner>
      {s.positions.some((p) => p.status === 'unresolved') && <Banner tone="warn"><b>Unresolved positions are not counted as open.</b> Their collateral stays reserved until the outcome is verified. Open them to check again.</Banner>}
      <Tabs value={tab} onChange={setTab} tabs={[{ v: 'open', label: 'Open', n: open.length }, { v: 'pending', label: 'Pending and unresolved', n: pend.length }, { v: 'closed', label: 'Closed', n: closed.length }]} />
      <Card className="flush">
        {list.length === 0 ? (
          <EmptyState title={tab === 'open' ? 'No open positions' : tab === 'pending' ? 'Nothing pending' : 'No closed positions yet'} body={tab === 'open' ? 'Find an opportunity in Markets. Positions appear here once confirmed.' : tab === 'pending' ? 'Submitted trades appear here until the network confirms them.' : 'Positions you close, exercise or let expire show here with their realized P&L.'} action={tab === 'open' ? <Button variant="gold" onClick={() => go('/app/markets')}>Explore markets</Button> : undefined} />
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
      <p className="tiny faint">No live market-data provider is connected. Market marks and P&amp;L are simulated; wallet balances and persistent contract positions are not represented by these session records.</p>
    </div>
  );
}
