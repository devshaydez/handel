import { useMemo, useState } from 'react';
import { LuSearch } from 'react-icons/lu';
import { Badge, Card, CardHead, EmptyState, PageHead, Tabs } from '../components/ui';
import { TESTNET_ASSETS } from '../data/testnet-assets';
import { go, useRoute } from '../router';

type Filter = 'all' | 'configured' | 'candidate' | 'not_enabled';

const STATUS: Record<Filter, (status: string) => boolean> = {
  all: () => true,
  configured: status => status === 'configured',
  candidate: status => status === 'candidate',
  not_enabled: status => status === 'not_enabled',
};

function statusLabel(status: string): string {
  if (status === 'configured') return 'Configured';
  if (status === 'candidate') return 'Candidate';
  return 'Not enabled';
}

export default function Markets() {
  const route = useRoute();
  const [query, setQuery] = useState(route.query.get('q') ?? '');
  const [filter, setFilter] = useState<Filter>('all');
  const assets = useMemo(() => TESTNET_ASSETS
    .filter(asset => STATUS[filter](asset.status))
    .filter(asset => (asset.symbol + ' ' + asset.tokenAccount + ' ' + asset.role).toLowerCase().includes(query.toLowerCase())),
  [filter, query]);

  return (
    <div className="page">
      <PageHead title="Markets & Testnet assets" sub="The actual Tidepool sandbox token catalogue configured for Handel. Live market prices and an option order book are not connected." />
      <Card>
        <div className="row gap12 wrap between">
          <label className="field grow" style={{ minWidth: 220 }}>
            <span className="label">Search assets</span>
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search symbol, token account or role…" />
          </label>
          <Badge tone="outline">NEAR Testnet</Badge>
        </div>
        <div className="mt12">
          <Tabs value={filter} onChange={setFilter} tabs={[
            { v: 'all', label: 'All assets', n: TESTNET_ASSETS.length },
            { v: 'configured', label: 'Configured', n: TESTNET_ASSETS.filter(asset => asset.status === 'configured').length },
            { v: 'candidate', label: 'Candidate', n: TESTNET_ASSETS.filter(asset => asset.status === 'candidate').length },
            { v: 'not_enabled', label: 'Not enabled', n: TESTNET_ASSETS.filter(asset => asset.status === 'not_enabled').length },
          ]} />
        </div>
      </Card>
      <Card className="flush">
        <CardHead title="Token registry" sub="Token identity and contract role; not a market-price feed" />
        {assets.length === 0 ? <EmptyState title="No matching assets" body="Try a different symbol or token account." /> : (
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Asset</th><th>NEP-141 token account</th><th>Decimals</th><th>Handel role</th><th>Status</th></tr></thead><tbody>
            {assets.map(asset => <tr key={asset.symbol} className="click" onClick={() => go('/app/markets/' + asset.symbol)}>
              <td><div className="semi">{asset.symbol}</div><div className="tiny muted">{asset.assetId}</div></td>
              <td className="mono tiny">{asset.tokenAccount}</td>
              <td className="num">{asset.decimals}</td>
              <td className="small">{asset.role}</td>
              <td><Badge tone={asset.status === 'configured' ? 'green' : 'outline'}>{statusLabel(asset.status)}</Badge></td>
            </tr>)}
          </tbody></table></div>
        )}
      </Card>
      <p className="tiny faint">A configured token is not itself a tradable option market. Handel must also verify the live contract asset registry, token metadata, storage registration and policy. No synthetic equity prices, implied volatility or option quotes are shown.</p>
    </div>
  );
}
