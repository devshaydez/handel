import { LuArrowRight, LuBriefcase, LuInbox, LuMessageSquareText, LuTriangleAlert, LuTrendingUp } from 'react-icons/lu';
import { AgentPill, TradeStatus } from '../components/status';
import { TickDonut } from '../components/charts';
import { Badge, Banner, Button, Card, CardHead, EmptyState, Growth, MCard, MStat, PageHead, PageSkeleton, Sparkle, SymBadge, Term, UnavailableState, useLoading } from '../components/ui';
import { fmtStamp, fmtShort } from '../data/mock';
import { go } from '../router';
import { agentStatus, dismissGuide, portfolio, useStore } from '../state/store';
import { signedUsd, usd, usd0 } from '../lib/pricing';
import { markPosition } from '../lib/valuation';

export default function Dashboard() {
  const s = useStore();
  const loading = useLoading(350);
  if (loading) return <PageSkeleton />;
  const pf = portfolio(s);
  const st = agentStatus(s);
  const pending = s.proposals.filter((p) => p.status === 'pending');
  const open = s.positions.filter((p) => p.status === 'open' || p.status === 'expired' || p.status === 'pending' || p.status === 'unresolved');
  const unresolved = s.positions.filter((p) => p.status === 'unresolved');
  const feedDown = s.demo.feed === 'down';
  const unread = s.notices.filter((n) => !n.read && n.tone !== 'info').slice(0, 3);

  const byAsset = Object.values(open.reduce<Record<string, { label: string; value: number }>>((a, p) => {
    const v = p.entryPremium * 100 * p.qty;
    (a[p.sym] ??= { label: p.sym, value: 0 }).value += v;
    return a;
  }, {}));

  return (
    <div className="page">
      <PageHead
        title="Dashboard"
        sub="Your capital, positions and risk at a glance, plus anything the AI needs from you."
        actions={<><Button icon={<LuMessageSquareText size={15} />} onClick={() => go('/app/assistant')}>Ask the assistant</Button><Button variant="gold" onClick={() => go('/app/markets')}>Explore markets</Button></>}
      />

      {!s.guideDismissed && (
        <Card className="guide">
          <div className="row between start wrap gap16">
            <div className="col gap8" style={{ maxWidth: 620 }}>
              <div className="row gap8"><Sparkle /><b>Quick tour</b></div>
              <p className="text2">Start in <b>Markets</b> to read the AI’s analysis, open an options chain, and build a trade. Everything you do is previewed and risk-checked before your wallet is asked to sign. Check <b>Agent</b> to see exactly what the AI may do, which is nothing unless you say so.</p>
            </div>
            <Button size="sm" onClick={dismissGuide}>Dismiss</Button>
          </div>
        </Card>
      )}

      {feedDown && <Banner tone="danger"><b>Market data is unavailable.</b> Prices and valuations below are hidden or marked unavailable. The agent will abstain until data returns.</Banner>}
      {s.demo.feed === 'stale' && <Banner tone="warn"><b>Market data is stale.</b> Pricing is shown as estimated and the agent’s verified-pricing requirement will block new actions.</Banner>}
      {unresolved.length > 0 && (
        <Banner tone="warn" action={<Button size="sm" onClick={() => go(`/app/portfolio/${unresolved[0].id}`)}>Review</Button>}>
          <b>{unresolved.length} transaction{unresolved.length > 1 ? 's' : ''} could not be verified.</b> {unresolved[0].sym} {unresolved[0].strike} {unresolved[0].side} is not counted as open, and its collateral stays reserved.
        </Banner>
      )}

      <div className="grid g4">
        <MCard title="Portfolio value" sub={<span>Collateral + open P&L</span>} tone="gold" href="/app/portfolio">
          <div className="hero-num">{usd(pf.value)}</div>
          <div className="row gap8">{empty ? <span className="muted small">No activity yet</span> : <Growth v={(pf.unrealized / pf.balance) * 100} />}<span className="tiny faint">unrealized</span></div>
        </MCard>
        <MCard title={<Term k="collateral">Available collateral</Term>} sub={<span>Testnet USDC</span>} tone="plain">
          <div className="mstat"><div className="v" style={{ fontSize: 30 }}>{usd(pf.available)}</div></div>
          <div className="mcard-f"><MStat sm label="Total balance" value={usd0(pf.balance)} /><MStat sm label="Reserved" value={usd0(pf.locked)} /></div>
        </MCard>
        <MCard title="Current exposure" sub={<span>Capital at risk</span>} tone={pf.exposurePct > 30 ? 'neg' : 'plain'} href="/app/portfolio">
          <div className="hero-num" style={{ fontSize: 34 }}>{pf.exposurePct.toFixed(1)}%</div>
          <div className="small muted">{usd0(pf.locked)} of {usd0(pf.balance)}. Your agent limit is {s.policy.maxExposurePct}%.</div>
        </MCard>
        <MCard title="P&L" sub={<span>Realized and unrealized</span>} tone={pf.unrealized < 0 ? 'neg' : undefined}>
          <div className="mcard-f" style={{ marginTop: 0 }}>
            <MStat label="Unrealized" value={<span className={pf.unrealized >= 0 ? 'green' : 'red'}>{feedDown ? '—' : signedUsd(pf.unrealized, 0)}</span>} />
            <MStat label="Realized" value={<span className={pf.realized >= 0 ? 'green' : 'red'}>{signedUsd(pf.realized, 0)}</span>} />
          </div>
          <div className="tiny faint">Unrealized P&amp;L is shown only when supported pricing evidence exists.</div>
        </MCard>
      </div>

      <div className="grid g-main">
        <div className="col gap16">
          <Card>
            <CardHead title="Account value" sub="Verified account history" />
            <EmptyState icon={<LuTrendingUp size={22} />} title="No verified history yet" body="Historical account-value indexing is not connected. Handel will not draw a synthetic performance chart." />
          </Card>

          <Card className="flush">
            <div style={{ padding: 18 }}><CardHead title="Open positions" sub={`${open.length} active or pending`} icon={<LuBriefcase size={16} />} right={<button className="link" onClick={() => go('/app/portfolio')}>View all</button>} /></div>
            {open.length === 0 ? (
              <EmptyState title="No open positions" body="When you open an option, it appears here once the network confirms it." action={<Button variant="gold" onClick={() => go('/app/markets')}>Explore markets</Button>} />
            ) : (
              <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Contract</th><th className="r hide-m">Qty</th><th className="r">Value</th><th className="r">P&L</th><th>Status</th></tr></thead><tbody>
                {open.slice(0, 5).map((p) => {
                  const m = markPosition(p, s.demo.feed);
                  return (
                    <tr key={p.id} className="click" onClick={() => go(`/app/portfolio/${p.id}`)}>
                      <td><div className="row gap12"><SymBadge sym={p.sym} /><div><div className="semi">{p.sym} {p.strike} {p.side}</div><div className="tiny muted">Exp {fmtShort(p.expiry)}</div></div></div></td>
                      <td className="r num hide-m">{p.qty}</td>
                      <td className="r num">{m.valued ? usd0(m.value) : '—'}</td>
                      <td className={`r num ${m.pnl >= 0 ? 'green' : 'red'}`}>{m.valued ? signedUsd(m.pnl, 0) : '—'}</td>
                      <td>{p.status === 'pending' ? <TradeStatus stage="pending" sm /> : p.status === 'unresolved' ? <TradeStatus stage="unknown" sm /> : p.status === 'expired' ? <Badge sm tone="amber">Expired</Badge> : <Badge sm tone="green">Open</Badge>}</td>
                    </tr>
                  );
                })}
              </tbody></table></div>
            )}
          </Card>

          <div className="grid g2">
            <MCard title="Realized P&amp;L" sub={<span>Verified settlements</span>}>
              <div className="hero-num" style={{ fontSize: 28 }}>{signedUsd(pf.realized, 0)}</div>
              <div className="tiny faint">No synthetic monthly performance history is displayed.</div>
            </MCard>
            <MCard title="Capital at risk" sub={<span>By underlying</span>}>
              {byAsset.length ? <TickDonut size={150} centerLabel="At risk" centerValue={`${pf.exposurePct.toFixed(0)}%`} data={byAsset} /> : <EmptyState title="Nothing at risk" body="No capital is reserved right now." />}
            </MCard>
          </div>
        </div>

        <div className="col gap16">
          <Card className="ai">
            <CardHead title={<><Sparkle />Handel Assistant</>} right={<AgentPill />} />
            <UnavailableState title="Live market feed is not connected" body="The current Testnet integration supports bounded wNEAR Call/Put creation, but it does not provide live equity prices, option quotes, volatility or news. The assistant will not invent market evidence." action={<Button size="sm" onClick={() => go('/app/assistant')}>Open Assistant</Button>} />
          </Card>

          <Card>
            <CardHead title="Needs your approval" icon={<LuInbox size={16} />} right={<Badge tone={pending.length ? 'gold' : 'outline'}>{pending.length}</Badge>} />
            {pending.length === 0 ? <p className="muted small">Nothing is waiting. {s.mode === 'advisory' ? 'In Advisory mode the AI only recommends.' : 'New proposals appear here.'}</p> : (
              <div className="col gap8">
                {pending.slice(0, 3).map((p) => (
                  <button key={p.id} className="list-item" onClick={() => go(`/app/proposals?id=${p.id}`)}>
                    <SymBadge sym={p.sym} />
                    <div className="grow"><div className="semi">{p.strategy} {p.sym} {p.strike}</div><div className="tiny muted">{p.qty} contract{p.qty > 1 ? 's' : ''} · {Math.round(p.confidence * 100)}% confidence</div></div>
                    <LuArrowRight size={15} className="muted" />
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHead title="Testnet execution scope" sub="What is actually connected" />
            <p className="small muted">The delegated contract path is limited to Tidepool Testnet wNEAR Call/Put positions. Equity tickers, prices and sample opportunities are not connected instruments.</p>
            <Button size="sm" onClick={() => go('/app/agent')}>Review on-chain limits</Button>
          </Card>

          {unread.length > 0 && (
            <Card>
              <CardHead title="Alerts" icon={<LuTriangleAlert size={16} />} />
              <div className="col gap8">{unread.map((n) => <button key={n.id} className="list-item" onClick={() => n.href && go(n.href)}><div className="grow"><div className="semi">{n.title}</div><div className="small muted">{n.body}</div></div></button>)}</div>
            </Card>
          )}
        </div>
      </div>

      <div className="grid g2">
        <Card>
          <CardHead title="Market coverage" right={<button className="link" onClick={() => go('/app/markets')}>Details</button>} />
          <p className="small muted">No live market-data provider is connected. NVDA, AAPL, MSFT and other equity examples are illustrative only and cannot be used as real underlying assets.</p>
        </Card>
        <Card>
          <CardHead title="Recent activity" right={<button className="link" onClick={() => go('/app/activity')}>Open journal</button>} />
          {s.activity.length === 0 ? <EmptyState title="No activity yet" body="Proposals, decisions and transactions are recorded here." /> : (
            <div className="col gap4">{s.activity.slice(0, 5).map((a) => (
              <button key={a.id} className="row gap12 start" style={{ padding: '8px 0', textAlign: 'left' }} onClick={() => go(`/app/activity/${a.id}`)}>
                <div className="grow"><div className="semi small">{a.title}</div><div className="tiny faint">{fmtStamp(a.ts)}</div></div>
                {a.stage && <TradeStatus stage={a.stage} sm />}
              </button>
            ))}</div>
          )}
        </Card>
      </div>
    </div>
  );
}
