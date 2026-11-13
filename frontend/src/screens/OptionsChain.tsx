import { Button, Card, CardHead, PageHead, UnavailableState } from '../components/ui';
import { go } from '../router';

export default function OptionsChain({ sym }: { sym: string }) {
  return (
    <div className="page">
      <PageHead crumbs={[{ label: 'Markets', href: '/app/markets' }, { label: sym.toUpperCase() }]} title={sym.toUpperCase() + ' options'} sub="No verified option chain is connected." />
      <Card>
        <CardHead title="Option quotes unavailable" />
        <UnavailableState title="No live option chain" body="The previous chain was generated from a Black–Scholes demo model. It has been removed from the production trading path because no live quote provider or volatility surface is connected." action={<Button onClick={() => go('/app/markets')}>Back to Markets</Button>} />
      </Card>
      <Card>
        <p className="small muted">The current NEAR Testnet contract supports writer-side wNEAR Call/Put creation with a fixed demo premium fixture. It does not expose a market-priced chain.</p>
        <Button variant="gold" onClick={() => go('/app/assistant')}>Use Assistant for Testnet Call/Put</Button>
      </Card>
    </div>
  );
}
