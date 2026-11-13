import { Button, Card, CardHead, PageHead, UnavailableState } from '../components/ui';
import { go } from '../router';

export default function AssetDetail({ sym }: { sym: string }) {
  return (
    <div className="page">
      <PageHead crumbs={[{ label: 'Markets', href: '/app/markets' }]} title={sym.toUpperCase()} sub="Market details are unavailable without a verified data connection." />
      <Card>
        <CardHead title="No verified market data" />
        <UnavailableState title="This is not a connected market instrument" body={sym.toUpperCase() + ' is not a supported NEAR Testnet underlying. Handel has removed the old simulated equity prices, news and analysis from this route.'} action={<Button onClick={() => go('/app/markets')}>Back to Markets</Button>} />
      </Card>
      <Card>
        <p className="small muted">The connected Testnet execution asset is wnear.tidepool-sandbox.testnet. It has no live market quote or option pricing feed in this build.</p>
        <Button variant="gold" onClick={() => go('/app/assistant')}>Open Assistant for Testnet execution</Button>
      </Card>
    </div>
  );
}
