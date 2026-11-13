import { useEffect, useState } from 'react';
import { LuBriefcase, LuMessageSquareText, LuShieldCheck, LuTriangleAlert } from 'react-icons/lu';
import { AgentPill } from '../components/status';
import { Badge, Banner, Button, Card, CardHead, EmptyState, MCard, PageHead, PageSkeleton, Term, useLoading } from '../components/ui';
import { go } from '../router';
import { useStore } from '../state/store';
import { fetchPortfolioPositions, type IndexedChainPosition } from '../lib/indexer-api';

function usdc(value: string): string {
  try { return (Number(BigInt(value)) / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 }); }
  catch { return 'Unavailable'; }
}

export default function Dashboard() {
  const s = useStore();
  const [positions, setPositions] = useState<IndexedChainPosition[]>([]);
  const [chainError, setChainError] = useState<string | null>(null);
  const [chainLoading, setChainLoading] = useState(false);
  const loading = useLoading(250);

  useEffect(() => {
    let active = true;
    if (!s.wallet.account) {
      setPositions([]);
      setChainError(null);
      return () => { active = false; };
    }
    setChainLoading(true);
    fetchPortfolioPositions(s.wallet.account)
      .then(rows => { if (active) { setPositions(rows); setChainError(null); } })
      .catch(error => { if (active) setChainError(error instanceof Error ? error.message : 'NEAR Testnet read failed'); })
      .finally(() => { if (active) setChainLoading(false); });
    return () => { active = false; };
  }, [s.wallet.account]);

  if (loading) return <PageSkeleton />;
  const activeStates = new Set(['PendingCollateral', 'PendingCollateralReconciliation', 'CollateralLocked', 'PendingPremium', 'Open', 'PendingSettlement', 'PendingExpiry', 'ReconciliationRequired']);
  const open = positions.filter(row => activeStates.has(row.state));
  const pending = positions.filter(row => row.state.startsWith('Pending') || row.state === 'ReconciliationRequired');
  const unresolved = positions.filter(row => row.state === 'ReconciliationRequired');
  const sessionEvents = s.activity.slice(0, 5);
  const modeLabel = s.mode === 'auto' ? 'Delegated' : s.mode === 'advisory' ? 'Advisory' : 'Manual approval';

  return (
    <div className="page">
      <PageHead
        title="Dashboard"
        sub="Your actual NEAR Testnet positions, agent authority and recent Handel activity."
        actions={<><Button icon={<LuMessageSquareText size={15} />} onClick={() => go('/app/assistant')}>Open Assistant</Button><Button variant="gold" onClick={() => go('/app/markets')}>Explore Testnet assets</Button></>}
      />

      {!s.wallet.account && <Banner tone="info">Connect your NEAR Testnet wallet to load positions directly from OptionsContract.</Banner>}
      {chainError && <Banner tone="warn"><b>On-chain portfolio read unavailable.</b> {chainError}</Banner>}
      {unresolved.length > 0 && <Banner tone="warn" action={<Button size="sm" onClick={() => go('/app/portfolio')}>Review portfolio</Button>}>
        <b>{unresolved.length} position{unresolved.length === 1 ? '' : 's'} need reconciliation.</b> Their contract state is not treated as settled.
      </Banner>}

      <div className="grid g4">
        <MCard title="On-chain positions" sub={<span>Writer or holder</span>} tone="gold" href="/app/portfolio">
          <div className="hero-num">{chainLoading ? '…' : positions.length}</div>
          <div className="tiny faint">{s.wallet.account ?? 'Wallet not connected'}</div>
        </MCard>
        <MCard title="Active positions" sub={<span>Finalized contract state</span>} href="/app/portfolio">
          <div className="hero-num">{chainLoading ? '…' : open.length}</div>
          <div className="tiny faint">Open or in lifecycle</div>
        </MCard>
        <MCard title="Pending / unresolved" sub={<span>Needs lifecycle attention</span>} tone={pending.length ? 'neg' : 'plain'} href="/app/portfolio">
          <div className="hero-num">{chainLoading ? '…' : pending.length}</div>
          <div className="tiny faint">Not counted as settled</div>
        </MCard>
        <MCard title="Agent execution" sub={<span>Chain-backed mode display</span>} tone="plain" href="/app/agent">
          <div className="hero-num" style={{ fontSize: 25 }}>{modeLabel}</div>
          <div className="tiny faint">Authority is controlled by on-chain policy</div>
        </MCard>
      </div>

      <div className="grid g-main">
        <div className="col gap16">
          <Card className="flush">
            <div style={{ padding: 18 }}><CardHead title="Your Testnet positions" sub="Actual OptionsContract records; no demo positions or estimated P&amp;L" icon={<LuBriefcase size={16} />} right={<button className="link" onClick={() => go('/app/portfolio')}>View portfolio</button>} /></div>
            {positions.length === 0 ? (
              <EmptyState title={chainLoading ? 'Reading NEAR Testnet…' : 'No on-chain positions found'} body={s.wallet.account ? 'No position owned by or held for this account was returned by the contract.' : 'Connect a NEAR Testnet wallet to check the contract.'} action={<Button variant="gold" onClick={() => go('/app/assistant')}>Open Assistant</Button>} />
            ) : (
              <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Position</th><th>Writer / Holder</th><th>Underlying (base units)</th><th>Strike (USDC)</th><th>Premium (USDC)</th><th>State</th></tr></thead><tbody>
                {positions.slice(0, 8).map(row => <tr key={row.contract_id + ':' + row.position_id}>
                  <td><div className="semi">#{row.position_id} · {row.payload.kind}</div><div className="tiny muted">{row.payload.asset_id}</div></td>
                  <td><div className="tiny">W: {row.writer}</div><div className="tiny">H: {row.holder}</div></td>
                  <td className="num">{row.payload.underlying_amount}</td>
                  <td className="num">{usdc(row.payload.strike_amount_usdc)}</td>
                  <td className="num">{usdc(row.payload.premium_amount_usdc)}</td>
                  <td><Badge tone="outline">{row.state}</Badge></td>
                </tr>)}
              </tbody></table></div>
            )}
          </Card>
          <Card>
            <CardHead title="Testnet trading scope" icon={<LuShieldCheck size={16} />} />
            <div className="grid g2">
              <div><div className="semi">Collateral / premium</div><div className="text2">USDC on NEAR Testnet</div><div className="tiny muted">Tidepool sandbox token rail</div></div>
              <div><div className="semi">Current underlying</div><div className="text2">wNEAR</div><div className="tiny muted">Writer-side Call/Put flow only where contract policy permits</div></div>
            </div>
            <p className="tiny faint">Other listed Testnet assets are not automatically enabled for option execution. Live spot prices and option quotes are not connected.</p>
          </Card>
        </div>

        <div className="col gap16">
          <Card className="ai">
            <CardHead title="Unified Handel Assistant" sub="Conversation and trade preparation" right={<AgentPill />} />
            <p className="text2">The Assistant is the conversational interface for the same agent configured on the Agent screen. It can explain supported Testnet flows and prepare a writer-side proposal; it must not invent live market quotes.</p>
            <Button size="sm" onClick={() => go('/app/assistant')}>Continue with Assistant</Button>
          </Card>
          <Card>
            <CardHead title="Agent authority" icon={<LuShieldCheck size={16} />} />
            <div className="row between"><span className="small muted">Execution mode</span><Badge tone={s.mode === 'auto' ? 'gold' : 'outline'}>{modeLabel}</Badge></div>
            <p className="small muted">Automatic execution is not enabled merely by changing a browser control. The principal must save an enabled on-chain policy and delegated mode.</p>
            <Button size="sm" onClick={() => go('/app/agent')}>Review permissions</Button>
          </Card>
          <Card>
            <CardHead title="Market data" icon={<LuTriangleAlert size={16} />} />
            <Banner tone="warn">No verified live spot, option bid/ask, implied-volatility or news provider is configured. Market valuation and P&amp;L remain unavailable.</Banner>
            <Button size="sm" onClick={() => go('/app/markets')}>View asset catalogue</Button>
          </Card>
          <Card>
            <CardHead title="Recent activity" right={<button className="link" onClick={() => go('/app/activity')}>Open journal</button>} />
            {sessionEvents.length === 0 ? <EmptyState title="No session events yet" body="Handel records successful actions and decisions made during this browser session." /> : (
              <div className="col gap8">{sessionEvents.map(event => <div key={event.id} className="list-item"><div className="grow"><div className="semi">{event.title}</div><div className="tiny muted">{event.summary}</div></div>{event.stage && <Badge tone="outline">{event.stage}</Badge>}</div>)}</div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
