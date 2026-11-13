import { Button, Card, CardHead, PageHead } from '../components/ui';
import { go } from '../router';

export default function PositionDetail({ id }: { id: string }) {
  return (
    <div className="page">
      <PageHead crumbs={[{ label: 'Portfolio', href: '/app/portfolio' }]} title="Position details" sub={`Position reference: ${id}`} />
      <Card>
        <CardHead title="On-chain position lookup is not connected" />
        <p className="text2">This build does not yet query OptionsContract for a writer’s full position history or reconstruct settlement state from chain receipts. No position valuation or exercise/release action is shown unless the underlying on-chain position can be verified.</p>
        <p className="small muted mt12">Testnet trade creation receipts appear in the current browser-session Activity journal. The journal is cleared when the session ends.</p>
        <div className="row gap8 wrap mt16">
          <Button onClick={() => go('/app/portfolio')}>Back to Portfolio</Button>
          <Button variant="gold" onClick={() => go('/app/assistant')}>Open Assistant</Button>
        </div>
      </Card>
    </div>
  );
}
