import { useEffect, useState } from 'react';
import { AgentPill } from '../components/status';
import { Badge, Banner, Button, Card, CardHead, EmptyState, MCard, PageHead } from '../components/ui';
import { fmtStamp } from '../data/mock';
import { go } from '../router';
import { useStore } from '../state/store';
import { fetchIndexedPortfolio, type IndexedChainPosition } from '../lib/indexer-api';

export default function Dashboard() {
  const s = useStore();
  const [positions, setPositions] = useState<IndexedChainPosition[]>([]);
  const [loading, setLoading] = useState(false);
  const [chainError, setChainError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!s.wallet.account) {
      setPositions([]);
      setChainError(null);
      return () => { active = false; };
    }
    setLoading(true);
    fetchIndexedPortfolio(s.wallet.account)
      .then(rows => { if (active) { setPositions(rows); setChainError(null); } })
      .catch(error => { if (active) setChainError(error instanceof Error ? error.message : 'Testnet position read failed'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [s.wallet.account]);

  const open = positions.filter(p => ['Open', 'CollateralLocked', 'PendingSettlement', 'PendingExpiry'].includes(p.state));
  const pending = positions.filter(p => p.state.startsWith('Pending'));
  const recent = [...s.activity].reverse().slice(0, 6);

  return (
    <div className="page">
      <PageHead
        title="Dashboard"
        sub="Handel's Testnet control center: verified contract positions, agent authority, and your current session."
        actions={<><Button onClick={() => go('/app/assistant')}>Open Assistant</Button><Button variant="gold" onClick={() => go('/app/markets')}>Explore markets</Button></>}
      />

      {!s.wallet.account && <Banner tone="info">Connect your NEAR Testnet wallet to load positions directly from OptionsContract.</Banner>}
      {chainError && <Banner tone="warn"><b>On-chain positions could not be loaded.</b> {chainError}. No demo balance or synthetic performance data is shown.</Banner>}

      <div className="grid g4">
        <MCard title="On-chain positions" tone="gold">
          <div className="hero-num">{loading ? '…' : positions.length}</div>
          <div className="tiny faint">Verified OptionsContract records</div>
        </MCard>
        <MCard title="Open / active">
          <div className="hero-num">{loading ? '…' : open.length}</div>
          <div className="tiny faint">Current contract states</div>
        </MCard>
        <MCard title="Pending lifecycle">
          <div className="hero-num">{loading ? '…' : pending.length}</div>
          <div className="tiny faint">Requires reconciliation or completion</div>
        </MCard>
        <MCard title="Session activity">
          <div className="hero-num">{s.activity.length}</div>
          <div className="tiny faint">This browser session only</div>
        </MCard>
      </div>

      <div className="grid g-main">
        <Card className="flush">
          <div style={{ padding: 18 }}>
            <CardHead title="Your Testnet positions" sub={s.wallet.account ?? 'Wallet not connected'} right={<button className="link" onClick={() => go('/app/portfolio')}>Open portfolio</button>} />
          </div>
          {!s.wallet.account ? (
            <EmptyState title="Connect a wallet" body="Portfolio data is read from finalized NEAR Testnet contract state after the contract exposes the pagination views." />
          ) : loading ? (
            <div className="pad muted small">Reading finalized Testnet state from two independent RPCs…</div>
          ) : positions.length === 0 ? (
            <EmptyState title="No positions returned" body="No matching writer or holder positions were found in the contract snapshot. This is not a token balance or valuation." />
          ) : (
            <div className="tbl-wrap"><table className="tbl">
              <thead><tr><th>Position</th><th>Type / asset</th><th>Writer / holder</th><th>Strike (USDC)</th><th>State</th><th>Block</th></tr></thead>
              <tbody>{positions.slice(0, 8).map(row => <tr key={row.contract_id + ':' + row.position_id}>
                <td className="semi">#{row.position_id}</td>
                <td><div>{row.payload.kind}</div><div className="tiny muted">{row.payload.asset_id}</div></td>
                <td><div className="tiny">W: {row.writer}</div><div className="tiny">H: {row.holder}</div></td>
                <td className="num">{(Number(row.payload.strike_amount_usdc) / 1_000_000).toLocaleString()}</td>
                <td><Badge tone="outline">{row.state}</Badge></td>
                <td className="num">{row.block_height}</td>
              </tr>)}</tbody>
            </table></div>
          )}
          <p className="tiny faint" style={{ padding: '0 18px 16px' }}>Position terms and state come from finalized contract views. No market mark, account equity, or P&amp;L is fabricated.</p>
        </Card>

        <div className="col gap16">
          <Card>
            <CardHead title="Agent authority" right={<AgentPill />} />
            <p className="small muted">The Assistant and Agent screen operate the same Handel agent. Execution authority is determined by the principal-signed on-chain policy and contract execution mode.</p>
            <Button block onClick={() => go('/app/agent')}>Review permissions</Button>
          </Card>
          <Card>
            <CardHead title="Market data" />
            <Badge tone="warning">Not connected</Badge>
            <p className="small muted mt8">Live spot prices, historical series, option bid/ask, implied volatility, and news are not configured. Trade premiums remain Testnet fixtures, not market quotes.</p>
            <Button block onClick={() => go('/app/markets')}>View supported assets</Button>
          </Card>
          <Card>
            <CardHead title="Quick actions" />
            <div className="col gap8">
              <Button block onClick={() => go('/app/assistant')}>Ask Handel Assistant</Button>
              <Button block onClick={() => go('/app/portfolio')}>View portfolio</Button>
              <Button block onClick={() => go('/app/activity')}>Open activity journal</Button>
            </div>
          </Card>
        </div>
      </div>

      <Card>
        <CardHead title="Recent activity" sub="Session journal; not a persistent transaction index." right={<button className="link" onClick={() => go('/app/activity')}>View all</button>} />
        {recent.length === 0 ? <EmptyState title="No activity in this session" body="Successful actions recorded by this browser session appear here. Full transaction and receipt indexing is a separate integration." /> : (
          <div className="col gap12">{recent.map(item => <div key={item.id} className="row between start gap12">
            <div><div className="semi small">{item.title}</div><div className="tiny muted">{item.summary}</div></div>
            <div className="tiny faint">{fmtStamp(item.ts)}</div>
          </div>)}</div>
        )}
      </Card>
    </div>
  );
}
