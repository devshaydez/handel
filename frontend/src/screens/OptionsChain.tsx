import { Badge, Banner, Button, Card, CardHead, KV, PageHead } from '../components/ui';
import { TESTNET_ASSETS } from '../data/testnet-assets';
import { go } from '../router';

export default function OptionsChain({ sym }: { sym: string }) {
  const asset = TESTNET_ASSETS.find(item => item.symbol.toLowerCase() === sym.toLowerCase());
  const eligibleCandidate = asset?.symbol === 'wNEAR' && asset.status === 'candidate';
  return (
    <div className="page">
      <PageHead
        crumbs={[{ label: 'Markets', href: '/app/markets' }, { label: sym.toUpperCase(), href: '/app/markets/' + sym }, { label: 'Options' }]}
        title={sym.toUpperCase() + ' options chain'}
        sub="Order-book and pricing data are not connected to Handel."
        actions={<Button onClick={() => go('/app/markets/' + sym)}>Back to asset</Button>}
      />
      <Card>
        <CardHead title="Market connectivity" right={<Badge tone="outline">Unavailable</Badge>} />
        <Banner tone="warn">Handel has no verified options venue or market-data provider for live calls, puts, bid/ask, implied volatility, Greeks, open interest or expiry ladders. This screen will not fabricate an options chain.</Banner>
        <div className="grid g2">
          <KV k="Underlying" v={asset?.symbol ?? sym.toUpperCase()} />
          <KV k="Token status" v={asset ? asset.status.replaceAll('_', ' ') : 'Not in Testnet catalogue'} />
          <KV k="Call / Put quotes" v="Not connected" />
          <KV k="Bid / Ask" v="Not connected" />
          <KV k="Implied volatility / Greeks" v="Not connected" />
          <KV k="Open interest / volume" v="Not connected" />
        </div>
      </Card>
      <Card>
        <CardHead title="Handel's current Testnet flow" />
        {eligibleCandidate ? (
          <>
            <p className="text2">The prototype supports a bilateral writer-side Call/Put workflow, not a public exchange order book. The Assistant can explain the current contract path and its on-chain policy checks.</p>
            <Banner tone="info">wNEAR is listed as a candidate underlying. Verify the live OptionsContract asset registry before attempting execution. Premium remains a fixed Testnet fixture, not a market quote.</Banner>
            <Button variant="gold" onClick={() => go('/app/assistant')}>Prepare with Assistant</Button>
          </>
        ) : (
          <>
            <p className="text2">This asset is not currently confirmed as an enabled options underlying in Handel's Testnet configuration.</p>
            <Button onClick={() => go('/app/markets')}>Review Testnet assets</Button>
          </>
        )}
      </Card>
    </div>
  );
}
