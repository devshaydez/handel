import { useEffect, useState } from 'react';
import { Badge, Banner, Button, Card, CardHead, EmptyState, MCard, PageHead, PageSkeleton } from '../components/ui';
import { useStore } from '../state/store';
import { go } from '../router';
import { fetchIndexedPortfolio, type IndexedChainPosition } from '../lib/indexer-api';

function usdc(raw: string): string {
  try {
    const amount = BigInt(raw);
    const whole = amount / 1_000_000n;
    const fraction = (amount % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
    return whole.toLocaleString() + (fraction ? '.' + fraction : '');
  } catch { return 'Unavailable'; }
}
function expiry(raw: string | number): string {
  try { return new Date(Number(BigInt(raw) / 1_000_000n)).toLocaleString(); }
  catch { return 'Unavailable'; }
}

export default function Portfolio() {
  const s = useStore();
  const [positions, setPositions] = useState<IndexedChainPosition[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!s.wallet.account) {
      setPositions([]);
      setError(null);
      return () => { active = false; };
    }
    setLoading(true);
    fetchIndexedPortfolio(s.wallet.account)
      .then(rows => { if (active) { setPositions(rows); setError(null); } })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Could not read Testnet positions'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [s.wallet.account]);

  const open = positions.filter(p => ['Open', 'CollateralLocked', 'PendingSettlement', 'PendingExpiry'].includes(p.state));
  const pending = positions.filter(p => p.state.startsWith('Pending'));
  const closed = positions.filter(p => ['Settled', 'Expired', 'Cancelled'].includes(p.state));

  return (
    <div className="page">
      <PageHead
        title="Portfolio"
        sub="Actual writer and holder positions read from finalized NEAR Testnet contract state. No mock valuation or P&amp;L."
        actions={<Button variant="gold" onClick={() => go('/app/markets')}>New trade</Button>}
      />
      {!s.wallet.account && <Banner tone="info">Connect your NEAR Testnet wallet to load positions for that account.</Banner>}
      {error && <Banner tone="warn"><b>Portfolio read unavailable.</b> {error}. The contract must expose the pagination views before this page can load the full position set.</Banner>}

      <div className="grid g4">
        <MCard title="Total positions" tone="gold"><div className="hero-num">{loading ? '…' : positions.length}</div><div className="tiny faint">Writer or holder</div></MCard>
        <MCard title="Open / active"><div className="hero-num">{loading ? '…' : open.length}</div><div className="tiny faint">Current contract states</div></MCard>
        <MCard title="Pending"><div className="hero-num">{loading ? '…' : pending.length}</div><div className="tiny faint">Lifecycle in progress</div></MCard>
        <MCard title="Settled / expired"><div className="hero-num">{loading ? '…' : closed.length}</div><div className="tiny faint">Terminal contract states</div></MCard>
      </div>

      <Card className="flush">
        <div style={{ padding: 18 }}>
          <CardHead title="On-chain positions" sub={s.wallet.account ? 'Account: ' + s.wallet.account : 'No wallet connected'} right={<button className="link" onClick={() => { if (s.wallet.account) window.open('https://explorer.testnet.near.org/accounts/' + encodeURIComponent(s.wallet.account), '_blank', 'noopener,noreferrer'); }}>View wallet on NEAR Explorer</button>} />
        </div>
        {loading ? <PageSkeleton /> : positions.length === 0 ? (
          <EmptyState title={s.wallet.account ? 'No matching positions found' : 'Connect your wallet'} body={s.wallet.account ? 'No OptionsContract positions were returned for this account at the finalized block. This is a contract-position view, not a token-balance view.' : 'Your writer and holder positions will appear here after wallet connection and contract indexing-view upgrade.'} />
        ) : (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Position</th><th>Writer / holder</th><th>Underlying (base units)</th><th>Strike (USDC)</th><th>Premium (USDC)</th><th>Expiry</th><th>State</th><th>Finalized block</th></tr></thead>
            <tbody>{positions.map(row => <tr key={row.contract_id + ':' + row.position_id}>
              <td><div className="semi">#{row.position_id} · {row.payload.kind}</div><div className="tiny muted">{row.payload.asset_id}</div></td>
              <td><div className="tiny">W: {row.writer}</div><div className="tiny">H: {row.holder}</div></td>
              <td className="num">{row.payload.underlying_amount}</td>
              <td className="num">{usdc(row.payload.strike_amount_usdc)}</td>
              <td className="num">{usdc(row.payload.premium_amount_usdc)}</td>
              <td className="tiny">{expiry(row.payload.expiry_ns)}</td>
              <td><Badge tone="outline">{row.state}</Badge></td>
              <td className="num">{row.block_height}</td>
            </tr>)}</tbody>
          </table></div>
        )}
        <p className="tiny faint" style={{ padding: '0 18px 16px' }}>Contract terms and lifecycle state are read from finalized chain views and cross-checked across two public RPCs. Underlying amounts remain in raw base units because token decimals are asset-specific. Market price, equity, and P&amp;L are intentionally not inferred.</p>
      </Card>
    </div>
  );
}
