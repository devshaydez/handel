import { Button, Card, CardHead, PageHead } from '../components/ui';
import { go } from '../router';

export default function Proposals() {
  return (
    <div className="page">
      <PageHead title="Proposals" sub="The legacy approval queue is not used by the current delegated Assistant flow." />
      <Card>
        <CardHead title="Use the Assistant for Testnet orders" />
        <p className="text2">The current execution path accepts explicit writer-side wNEAR Call/Put instructions in Assistant. It checks the active on-chain policy and uses the restricted FunctionCall key. This legacy proposal screen is not connected to that flow and no longer appears in the main navigation.</p>
        <Button variant="gold" onClick={() => go('/app/assistant')}>Open Assistant</Button>
      </Card>
    </div>
  );
}
