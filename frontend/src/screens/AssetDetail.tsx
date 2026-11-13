import { Badge, Banner, Button, Card, CardHead, EmptyState, KV, PageHead } from '../components/ui';
import { TESTNET_ASSETS } from '../data/testnet-assets';
import { go } from '../router';

export default function AssetDetail({ sym }: { sym: string }) {
  const asset = TESTNET_ASSETS.find(item => item.symbol.toLowerCase() === sym.toLowerCase());
  if (!asset) return <div className="page"><EmptyState title="Asset not in the Testnet catalogue" body="Handel only displays assets from its checked-in Tidepool Testnet token catalogue." action={<Button onClick={() => go('/app/markets')}>Back to Markets</Button>} /></div>;

  const status = asset.status === 'configured' ? 'Configured' : asset.status === 'candidate' ? 'Candidate' : 'Not enabled';
  return (
    <div className="page">
      <PageHead
        crumbs={[{ label: 'Markets', href: '/app/markets' }, { label: asset.symbol }]}
        title={asset.symbol + ' · NEAR Testnet'}
        sub="Token identity, contract role and execution readiness."
        actions={<Button onClick={() => go('/app/markets')}>Back to assets</Button>}
      />
      <div className="grid g2">
        <Card>
          <CardHead title="Asset status" right={<Badge tone={asset.status === 'configured' ? 'green' : 'outline'}>{status}</Badge>} />
          <p className="text2">{asset.role}.</p>
          <KV k="Asset ID" v={<span className="mono tiny">{asset.assetId}</span>} />
          <KV k="NEP-141 account" v={<span className="mono tiny">{asset.tokenAccount}</span>} />
          <KV k="Token decimals" v={String(asset.decimals)} />
          <KV k="Network" v="NEAR Testnet" />
        </Card>
        <Card>
          <CardHead title="Market data & options" />
          <Banner tone="warn">No verified live spot price, historical price series, volatility, option bid/ask or news feed is connected. Handel will not display simulated quotes as live market data.</Banner>
          <p className="small muted">A token appearing in the registry does not mean the OptionsContract has enabled it or that a matching option market exists.</p>
          <Button variant="gold" onClick={() => go('/app/assistant')}>Ask the Handel Assistant</Button>
        </Card>
      </div>
      <Card>
        <CardHead title="Execution checks" sub="Required before this token can be used in a Testnet option" />
        <ul className="small text2 col gap8" style={{ paddingLeft: 18, listStyle: 'disc' }}>
          <li>Verify NEP-141 metadata against an independent NEAR Testnet RPC.</li>
          <li>Verify the token contract code hash and owner/minter configuration.</li>
          <li>Confirm the OptionsContract asset registry marks this asset enabled.</li>
          <li>For escrow rails, verify NEP-145 storage bounds and registration for the intended account.</li>
          <li>Confirm the principal's on-chain agent policy permits this asset before delegated execution.</li>
        </ul>
      </Card>
    </div>
  );
}
