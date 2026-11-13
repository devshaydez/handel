import { LuArrowRight, LuBriefcase, LuInbox, LuMessageSquareText, LuTriangleAlert, LuTrendingUp } from 'react-icons/lu';
import { AgentPill, TradeStatus } from '../components/status';
import { AreaChart, Bars, Sparkline, TickDonut } from '../components/charts';
import { Badge, Banner, Button, Card, CardHead, EmptyState, MCard, PageHead, PageSkeleton, Sparkle, SymBadge, UnavailableState, useLoading } from '../components/ui';
import { ASSETS, fmtStamp, fmtShort } from '../data/mock';
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
  const empty = s.positions.length === 0;
  const feedDown = s.demo.feed === 'down';
  const opp = ASSETS.filter((a) => a.signal === 'opportunity' && a.optionsSupported);
  const unread = s.notices.filter((n) => !n.read && n.tone !== 'info').slice(0, 3);

  // Equity curve: demo series ending at the current value
  const eq = Array.from({ length: 30 }, (_, i) => pf.value - (29 - i) * 38 + Math.sin(i / 2.6) * 210 + (i % 5) * 22 - (empty ? 0 : 0));
  eq[29] = pf.value;
  const bars = ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'].map((l, i) => ({ label: l, value: [1180, -220, 310, 210, 1120, pf.realized - 2600 + 180][i] ?? 0 }));
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

      <Banner tone="warn"><b>Account data is not fabricated.</b> This dashboard does not display demo balances or claim a complete on-chain position index. Market research below uses simulated fixtures.</Banner>
      {feedDown && <Banner tone="danger"><b>Market data is unavailable.</b> Prices and valuations below are hidden or marked unavailable. The agent will abstain until data returns.</Banner>}
      {s.demo.feed === 'stale' && <Banner tone="warn"><b>Market data is stale.</b> Pricing is shown as estimated and the agent’s verified-pricing requirement will block new actions.</Banner>}
      {unresolved.length > 0 && (
        <Banner tone="warn" action={<Button size="sm" onClick={() => go(`/app/portfolio/${unresolved[0].id}`)}>Review</Button>}>
          <b>{unresolved.length} transaction{unresolved.length > 1 ? 's' : ''} could not be verified.</b> {unresolved[0].sym} {unresolved[0].strike} {unresolved[0].side} is not counted as open, and its collateral stays reserved.
        </Banner>
      )}

      <div className="grid g4">
        <MCard title="Testnet wallet" sub={<span>Live token balances</span>} tone="gold" href="/app/settings"><div className="hero-num" style={{ fontSize: 26 }}>Open wallet</div><div className="tiny faint">Connect and verify USDC / wNEAR balances in Settings</div></MCard>
        <MCard title="Positions" sub={<span>Contract state</span>} tone="plain" href="/app/portfolio"><div className="hero-num" style={{ fontSize: 26 }}>Not indexed</div><div className="tiny faint">Persistent chain indexing is not yet configured</div></MCard>
        <MCard title="Market data" sub={<span>Research and simulation</span>} tone="plain" href="/app/markets"><div className="hero-num" style={{ fontSize: 26 }}>Simulated</div><div className="tiny faint">No live market-data provider is connected</div></MCard>
        <MCard title="Agent authority" sub={<span>On-chain permissions</span>} tone="plain" href="/app/agent"><div className="hero-num" style={{ fontSize: 26 }}>{s.mode === 'auto' ? 'Delegated' : 'Approval'}</div><div className="tiny faint">Configured execution mode; verify on-chain policy</div></MCard>
      </div>

      <div className="grid g-main">
        <div className="col gap16">
          <Card><CardHead title="Account value" sub="Unavailable until persistent Testnet balance and position indexing is configured" /><EmptyState icon={<LuTrendingUp size={22} />} title="No verified account history" body="Handel will show this chart when it can reconstruct balances and positions from Testnet records." action={<Button variant="gold" onClick={() => go('/app/portfolio')}>View session activity</Button>} /></Card>

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
            <MCard title="Realized P&L" sub={<span>Monthly</span>}>
              <Bars data={bars} height={130} fmt={(v) => signedUsd(v, 0)} selected={4} />
            </MCard>
            <MCard title="Capital at risk" sub={<span>By underlying</span>}>
              {byAsset.length ? <TickDonut size={150} centerLabel="At risk" centerValue={`${pf.exposurePct.toFixed(0)}%`} data={byAsset} /> : <EmptyState title="Nothing at risk" body="No capital is reserved right now." />}
            </MCard>
          </div>
        </div>

        <div className="col gap16">
          <Card className="ai">
            <CardHead title={<><Sparkle />AI market summary</>} sub={<>Generated {fmtStamp(new Date(Date.UTC(2026, 10, 11, 9, 30)).toISOString())}</>} right={<AgentPill />} />
            {feedDown ? (
              <UnavailableState title="Summary unavailable" body="The AI won’t describe the market without current data. It will resume when the feed returns." />
            ) : (
              <div className="col gap12">
                <p className="text2">Large-cap tech is trending up on moderate volume. Volatility is mixed: elevated in TSLA, depressed in AAPL. Two setups currently pass the screen, and the AI is deliberately sitting out AAPL and TSLA.</p>
                <div className="row gap8 wrap">{opp.map((a) => <Badge key={a.sym} tone="gold">{a.sym} setup</Badge>)}<Badge tone="outline">AAPL no trade</Badge></div>
                <div className="small muted">Analysing: <b className="text2">{st.key === 'analysing' ? 'in progress…' : 'idle'}</b></div>
                <div className="row gap8 wrap"><Button size="sm" onClick={() => go('/app/assistant')}>Ask why</Button></div>
              </div>
            )}
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
            <CardHead title="Active opportunities" sub="From the AI screen" />
            <div className="col gap8">
              {opp.map((a) => (
                <button key={a.sym} className="list-item" onClick={() => go(`/app/markets/${a.sym}`)}>
                  <SymBadge sym={a.sym} />
                  <div className="grow"><div className="semi">{a.sym}</div><div className="tiny muted ellipsis">{a.summary}</div></div>
                  <Badge tone="gold" sm>Setup</Badge>
                </button>
              ))}
            </div>
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
          <CardHead title="Watchlist" right={<button className="link" onClick={() => go('/app/markets')}>Manage</button>} />
          {s.watchlist.length === 0 ? <EmptyState title="Watchlist is empty" body="Star an asset in Markets to follow it here." /> : (
            <div className="col gap4">
              {s.watchlist.map((sym) => {
                const a = ASSETS.find((x) => x.sym === sym)!;
                const ch = (a.price / a.prevClose - 1) * 100;
                return (
                  <button key={sym} className="row gap12 between" style={{ padding: '8px 0' }} onClick={() => go(`/app/markets/${sym}`)}>
                    <span className="row gap12"><SymBadge sym={sym} /><span><div className="semi">{sym}</div><div className="tiny muted">{a.name}</div></span></span>
                    <Sparkline data={a.series.slice(-30)} />
                    <span className="right"><div className="semi num">{feedDown ? '—' : usd(a.price)}</div>{!feedDown && <Growth v={ch} />}</span>
                  </button>
                );
              })}
            </div>
          )}
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
