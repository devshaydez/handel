import { useState } from 'react';
import { Badge, Banner, Button, Card, CardHead, PageHead } from '../components/ui';
import { go } from '../router';

export default function TradeBuilder() {
  const [side, setSide] = useState<'Call' | 'Put'>('Call');
  const [holder, setHolder] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [strike, setStrike] = useState('');
  const [expiryDays, setExpiryDays] = useState('7');
  const [error, setError] = useState('');

  function continueToAssistant() {
    const account = holder.trim().toLowerCase();
    if (!/^[a-z0-9]+([._-][a-z0-9]+)*$/.test(account) || account.length > 64) {
      setError('Enter a valid NEAR Testnet holder account.');
      return;
    }
    if (!Number.isFinite(Number(quantity)) || Number(quantity) <= 0 || Number(quantity) > 100) {
      setError('Quantity must be greater than 0 and no more than 100 wNEAR.');
      return;
    }
    if (!Number.isFinite(Number(strike)) || Number(strike) <= 0) {
      setError('Enter a positive USDC strike amount.');
      return;
    }
    if (!Number.isInteger(Number(expiryDays)) || Number(expiryDays) < 1 || Number(expiryDays) > 90) {
      setError('Expiry must be between 1 and 90 days.');
      return;
    }
    const prompt = 'Preflight this proposed NEAR Testnet wNEAR ' + side + ': holder ' + account +
      ', quantity ' + quantity + ' wNEAR, strike ' + strike + ' USDC, expiry in ' + expiryDays +
      ' days. Explain the on-chain asset, policy, collateral and premium requirements and any blockers. ' +
      'Do not create a position, submit a transaction, or initiate funding. I only want a review of this draft.';
    go('/app/assistant?draft=' + encodeURIComponent(prompt));
  }

  return (
    <div className="page">
      <PageHead title="Trade builder" sub="Configure a bilateral NEAR Testnet wNEAR option draft, then ask the unified Assistant to check it. No transaction is created from this screen." />
      {error && <Banner tone="danger">{error}</Banner>}
      <div className="grid g-side">
        <div className="col gap16">
          <Card>
            <CardHead title="Contract terms" sub="Current prototype scope: wNEAR underlying, USDC strike and premium" />
            <div className="field">
              <span className="label">Underlying</span>
              <div className="row between"><b>wNEAR</b><Badge tone="outline">NEAR Testnet</Badge></div>
              <span className="hint">This is a Testnet token, not a tokenized stock or live-market instrument.</span>
            </div>
            <div className="field mt12">
              <span className="label">Option type</span>
              <div className="seg"><button className={side === 'Call' ? 'on' : ''} onClick={() => setSide('Call')}>Call</button><button className={side === 'Put' ? 'on' : ''} onClick={() => setSide('Put')}>Put</button></div>
            </div>
            <label className="field mt12"><span className="label">Holder NEAR account</span><input value={holder} onChange={event => setHolder(event.target.value)} placeholder="holder.testnet" autoComplete="off" /></label>
            <div className="grid g2 mt12">
              <label className="field"><span className="label">Quantity (wNEAR)</span><input inputMode="decimal" value={quantity} onChange={event => setQuantity(event.target.value)} /></label>
              <label className="field"><span className="label">Strike (USDC)</span><input inputMode="decimal" value={strike} onChange={event => setStrike(event.target.value)} placeholder="e.g. 5" /></label>
              <label className="field"><span className="label">Expiry (days)</span><input inputMode="numeric" value={expiryDays} onChange={event => setExpiryDays(event.target.value)} /></label>
            </div>
          </Card>
          <Card>
            <CardHead title="Review boundary" />
            <Banner tone="info">Continuing opens the Assistant with this draft prefilled. It does not sign, create a position, lock collateral or pay premium.</Banner>
            <p className="small muted">The current premium is a fixed Testnet fixture, not a market quote. A live option chain, bid/ask, implied volatility and Greeks are not connected.</p>
            <Button variant="gold" block onClick={continueToAssistant}>Review draft with Assistant</Button>
          </Card>
        </div>
        <Card>
          <CardHead title="Execution requirements" />
          <ul className="small text2 col gap8" style={{ paddingLeft: 18, listStyle: 'disc' }}>
            <li>The holder must be a different NEAR account from the writer.</li>
            <li>The principal's on-chain policy must allow the asset and trade limits.</li>
            <li>Delegated execution must be explicitly enabled on-chain; a browser toggle is not authority.</li>
            <li>Principal collateral requires its own wallet authorisation.</li>
            <li>The holder separately signs the premium payment.</li>
          </ul>
          <p className="tiny faint">The Assistant must complete its own preflight. This form does not assume that wNEAR is currently enabled in the deployed contract.</p>
        </Card>
      </div>
    </div>
  );
}
