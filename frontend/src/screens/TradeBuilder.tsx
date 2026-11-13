import { Button, Card, CardHead, PageHead } from '../components/ui';
import { go } from '../router';

export default function TradeBuilder() {
  return (
    <div className="page">
      <PageHead title="Trade Builder" sub="The legacy quote-driven builder is not available in this Testnet build." />
      <Card>
        <CardHead title="Use the connected execution flow" />
        <p className="text2">The previous builder depended on simulated equity prices and generated option quotes. It has been retired so those values cannot be mistaken for live pricing or sent as real market orders.</p>
        <p className="small muted mt12">For the supported Testnet path, use the Assistant to submit an explicit writer-side wNEAR Call or Put request. The premium is a fixed demo fixture; your principal wallet still signs collateral and the holder separately signs premium.</p>
        <Button variant="gold" onClick={() => go('/app/assistant')}>Open Assistant</Button>
      </Card>
    </div>
  );
}
