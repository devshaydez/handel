import { Badge, Banner, Button, Card, CardHead, KV, PageHead } from '../components/ui';
import { go } from '../router';

export default function Markets() {
  return (
    <div className="page">
      <PageHead title="Markets" sub="Live market prices and option quotes are not connected in this Testnet build." />
      <Banner tone="warn"><b>No live market feed.</b> Equity tickers and their sample prices have been removed from the tradable market view. Handel will not treat illustrative values as executable quotes.</Banner>
      <Card>
        <CardHead title="Connected Testnet instrument" right={<Badge tone="outline">Testnet only</Badge>} />
        <KV k="Network" v="NEAR Testnet" />
        <KV k="Underlying token" v="wnear.tidepool-sandbox.testnet" />
        <KV k="Options" v="Writer-side Call and Put" />
        <KV k="Pricing" v="Fixed demo premium fixture; not a market quote" />
        <KV k="Execution" v="OptionsContract + Escrow" />
        <p className="small muted mt12">This is a synthetic Testnet asset, not a tokenized share or live-market instrument. The current integration does not provide an order book, spot price, volatility surface, option chain or external counterparty discovery.</p>
        <div className="row gap8 wrap mt16">
          <Button variant="gold" onClick={() => go('/app/assistant')}>Create a Testnet Call/Put in Assistant</Button>
          <Button onClick={() => go('/app/agent')}>Review agent limits</Button>
        </div>
      </Card>
      <Card>
        <CardHead title="Unavailable market integrations" />
        <p className="small muted">Live equities, live option quotes, news and volatility data are not configured. Until a verified provider is connected, these sections remain unavailable rather than showing fabricated prices or sample headlines.</p>
      </Card>
    </div>
  );
}
