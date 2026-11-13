import { useEffect, useMemo, useState } from 'react';
import { Badge, Banner, Button, Card, CardHead, EmptyState, MCard, PageHead, PageSkeleton, Tabs, useLoading } from '../components/ui';
import { go } from '../router';
import { useStore } from '../state/store';
import { fetchPortfolioPositions, type IndexedChainPosition } from '../lib/indexer-api';

type Tab = 'all' | 'active' | 'pending' | 'closed';

function classify(state: string): Tab {
  if (['Settled', 'Expired', 'Cancelled'].includes(state)) return 'closed';
  if (state.startsWith('Pending') || state === 'ReconciliationRequired') return 'pending';
  return 'active';
}
function usdc(value: string): string {
  try { return (Number(BigInt(value)) / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 }); }
  catch { return 'Unavailable'; }
}

export default function Portfolio() {
  const s = useStore();
  const [tab, setTab] = useState<Tab>('all');
  const [positions, setPositions] = useState<IndexedChainPosition[]>([]);
  const [chainError, setChainError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const loading = useLoading(250);

  useEffect(() => {
    let active = true;
    if (!s.wallet.account) {
      setPositions([]);
      setChainError(null);
      return () => { active = false; };
    }
    setRefreshing(true);
    fetchPortfolioPositions(s.wallet.account)
      .then(rows => { if (active) { setPositions(rows); setChainError(null); } })
      .catch(error => { if (active) setChainError(error instanceof Error ? error.message : 'NEAR Testnet read failed'); })
      .finally(() => { if (active) setRefreshing(false); });
    return () => { active = false; };
  }, [s.wallet.account]);

  const counts = useMemo(() => ({
    all: positions.length,
    active: positions.filter(row => classify(row.state) === 'active').length,
    pending: positions.filter(row => classify(row.state) === 'pending').length,
    closed: positions.filter(row => classify(row.state) === 'closed').length,
  }), [positions]);
  const visible = tab === 'all' ? positions : positions.filter(row => classify(row.state) === tab);

  if (loading) return <PageSkeleton />;
  return (
    <div className="page">
      <PageHead title="Portfolio" sub="Actual NEAR Testnet OptionsContract positions where your connected account is writer or holder." actions={<Button onClick={() => { if (s.wallet.account) { setRefreshing(true); void fetchPortfolioPositions(s.wallet.account).then(setPositions).catch(error => setChainError(error instanceof Error ? error.message : 'NEAR Testnet read failed')).finally(() => setRefreshing(false)); } }}>Refresh</Button>} />
      {!s.wallet.account && <Banner tone="info">Connect your NEAR Testnet wallet to read positions directly from OptionsContract.</Banner>}
      {chainError && <Banner tone="warn"><b>Portfolio read unavailable.</b> {chainError}</Banner>}
      <div className="grid g4">
        <MCard title="Total positions" tone="gold"><div className="hero-num">{positions.length}</div><div className="tiny faint">Writer or holder</div></MCard>
        <MCard title="Active"><div className="hero-num">{counts.active}</div><div className="tiny faint">Current contract lifecycle</div></MCard>
        <MCard title="Pending / unresolved" tone={counts.pending ? 'neg' : 'plain'}><div className="hero-num">{counts.pending}</div><div className="tiny faint">Not treated as settled</div></MCard>
        <MCard title="Closed"><div className="hero-num">{counts.closed}</div><div className="tiny faint">Settled, expired or cancelled</div></MCard>
      </div>
      <Card>
        <CardHead title="On-chain Testnet positions" sub={refreshing ? 'Refreshing finalized contract state…' : s.wallet.account ?? 'Wallet not connected'} />
        <Tabs value={tab} onChange={setTab} tabs={[
          { v: 'all', label: 'All', n: counts.all },
          { v: 'active', label: 'Active', n: counts.active },
          { v: 'pending', label: 'Pending', n: counts.pending },
          { v: 'closed', label: 'Closed', n: counts.closed },
        ]} />
        {visible.length === 0 ? <EmptyState title={refreshing ? 'Reading NEAR Testnet…' : 'No positions in this view'} body={s.wallet.account ? 'No matching position was returned for this connected account. This page does not create demo positions.' : 'Connect a NEAR Testnet wallet to inspect your actual positions.'} action={<Button variant="gold" onClick={() => go('/app/assistant')}>Open Assistant</Button>} /> : (
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Position</th><th>Writer / Holder</th><th>Underlying amount</th><th>Strike (USDC)</th><th>Premium (USDC)</th><th>State</th><th>Finalized block</th></tr></thead><tbody>
            {visible.map(row => <tr key={row.contract_id + ':' + row.position_id} className="click" onClick={() => go('/app/portfolio/' + row.position_id)}>
              <td><div className="semi">#{row.position_id} · {row.payload.kind}</div><div className="tiny muted">{row.payload.asset_id}</div></td>
              <td><div className="tiny">W: {row.writer}</div><div className="tiny">H: {row.holder}</div></td>
              <td className="num">{row.payload.underlying_amount} <span className="tiny muted">base units</span></td>
              <td className="num">{usdc(row.payload.strike_amount_usdc)}</td>
              <td className="num">{usdc(row.payload.premium_amount_usdc)}</td>
              <td><Badge tone="outline">{row.state}</Badge></td>
              <td className="num">{row.block_height}</td>
            </tr>)}
          </tbody></table></div>
        )}
      </Card>
      <p className="tiny faint">Terms and lifecycle state come from finalized contract views. No portfolio valuation, mark price or P&amp;L is shown because a verified live market-price provider is not connected. This direct RPC mode does not require a paid database.</p>
    </div>
  );
}
