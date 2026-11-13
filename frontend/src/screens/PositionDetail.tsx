import { useEffect, useState } from 'react';
import { Badge, Banner, Button, Card, CardHead, EmptyState, KV, PageHead, PageSkeleton } from '../components/ui';
import { go } from '../router';
import { useStore } from '../state/store';
import { fetchPortfolioPositions, type IndexedChainPosition } from '../lib/indexer-api';

function formatUsdc(raw: string): string {
  try {
    const value = BigInt(raw);
    const whole = value / 1_000_000n;
    const fraction = (value % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
    return whole.toLocaleString() + (fraction ? '.' + fraction : '') + ' USDC';
  } catch { return 'Unavailable'; }
}

function formatExpiry(raw: string | number): string {
  try {
    const millis = Number(BigInt(String(raw)) / 1_000_000n);
    return Number.isFinite(millis) ? new Date(millis).toLocaleString() : 'Unavailable';
  } catch { return 'Unavailable'; }
}

export default function PositionDetail({ id }: { id: string }) {
  const s = useStore();
  const [position, setPosition] = useState<IndexedChainPosition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!s.wallet.account) {
      setPosition(null);
      setError('Connect the writer or holder NEAR Testnet wallet to verify this position.');
      setLoading(false);
      return () => { active = false; };
    }
    setLoading(true);
    fetchPortfolioPositions(s.wallet.account)
      .then(rows => {
        if (!active) return;
        const found = rows.find(row => row.position_id === id);
        setPosition(found ?? null);
        setError(found ? null : 'This position was not returned for the connected account as writer or holder.');
      })
      .catch(reason => {
        if (active) {
          setPosition(null);
          setError(reason instanceof Error ? reason.message : 'NEAR Testnet position lookup failed.');
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [s.wallet.account, id]);

  if (loading) return <PageSkeleton />;
  if (!position) return <div className="page">
    <PageHead title={'Position #' + id} sub="Finalized OptionsContract lookup" actions={<Button onClick={() => go('/app/portfolio')}>Back to Portfolio</Button>} />
    <EmptyState title="No verified on-chain position" body={error ?? 'No matching position was found.'} action={<Button onClick={() => go('/app/portfolio')}>Back to Portfolio</Button>} />
  </div>;

  return (
    <div className="page">
      <PageHead title={'Position #' + position.position_id} sub="Read-only details from the finalized OptionsContract state." actions={<Button onClick={() => go('/app/portfolio')}>Back to Portfolio</Button>} />
      <Card>
        <CardHead title={position.payload.kind + ' · ' + position.payload.asset_id} right={<Badge tone="outline">{position.state}</Badge>} />
        <KV k="Contract" v={position.contract_id} />
        <KV k="Writer" v={position.writer} />
        <KV k="Holder" v={position.holder} />
        <KV k="Underlying amount" v={position.payload.underlying_amount + ' base units'} />
        <KV k="Strike" v={formatUsdc(position.payload.strike_amount_usdc)} />
        <KV k="Premium" v={formatUsdc(position.payload.premium_amount_usdc)} />
        <KV k="Expiry" v={formatExpiry(position.payload.expiry_ns)} />
        <KV k="Escrow position ID" v={position.payload.escrow_position_id == null ? 'Not registered' : String(position.payload.escrow_position_id)} />
        <KV k="Finalized block" v={String(position.block_height)} />
        <KV k="Block hash" v={<span className="mono tiny">{position.block_hash}</span>} />
      </Card>
      <Banner tone="info">This is a verified read-only contract snapshot. Handel does not invent a mark price or P&amp;L, and it does not offer exercise/release actions until the corresponding on-chain lifecycle state and escrow evidence are verified. Full transaction/receipt history is not yet indexed.</Banner>
    </div>
  );
}
