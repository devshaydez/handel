import { useState } from 'react';
import { createDelegatedTrade, type DelegatedTradeReply } from '../lib/handel-api';
import {
  authorizeDelegatedCollateralFunding,
  authorizeDelegatedPremiumPayment,
  connectNearWallet,
  currentNearAccount,
  signAgentProposalIntent,
  type WalletTransactionResult,
} from '../lib/near-wallet';
import { Button, Card, CardHead } from './ui';

const ASSET_ID = 'nep141:wnear.tidepool-sandbox.testnet';
const PREMIUM = import.meta.env.VITE_HANDEL_DEMO_PREMIUM_FIXTURE || '5000000';

export function TestnetProposalComposer() {
  const [holder, setHolder] = useState('');
  const [quantity, setQuantity] = useState('1000000000000000000000000');
  const [strike, setStrike] = useState('10000000');
  const [kind, setKind] = useState<'Call' | 'Put'>('Call');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reply, setReply] = useState<DelegatedTradeReply | null>(null);
  const [collateral, setCollateral] = useState<WalletTransactionResult | null>(null);
  const [premiumPaid, setPremiumPaid] = useState<WalletTransactionResult | null>(null);

  async function createTrade() {
    setBusy(true); setError('');
    try {
      let principal = await currentNearAccount();
      if (!principal) principal = (await connectNearWallet()).accountId;
      const buyer = holder.trim();
      if (!buyer || buyer === principal) throw new Error('Enter a different NEAR account as the holder.');
      const expiryNs = (BigInt(Date.now() + 7 * 86_400_000) * 1_000_000n).toString();
      const authorization = await signAgentProposalIntent({
        principal, holder: buyer, kind, assetId: ASSET_ID, quantity, strike, premium: PREMIUM, expiryNs,
        action: 'authorize one bounded delegated Testnet trade under the active on-chain policy',
      });
      const result = await createDelegatedTrade({
        principal,
        holder: buyer,
        authorization,
        request: { type: kind, assetId: ASSET_ID, quantity, strike, expiryNs },
      });
      setReply(result); setCollateral(null); setPremiumPaid(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Delegated trade submission failed.'); }
    finally { setBusy(false); }
  }

  async function fundCollateral() {
    if (!reply) return;
    setBusy(true); setError('');
    try {
      const result = await authorizeDelegatedCollateralFunding(reply.trade.positionId, reply.trade.escrowPositionId);
      setCollateral(result);
    } catch (e) { setError(e instanceof Error ? e.message : 'Principal collateral transfer failed.'); }
    finally { setBusy(false); }
  }

  async function payPremium() {
    if (!reply || !collateral) return;
    setBusy(true); setError('');
    try {
      const result = await authorizeDelegatedPremiumPayment(reply.trade.positionId, reply.trade.escrowPositionId);
      setPremiumPaid(result);
    } catch (e) { setError(e instanceof Error ? e.message : 'Holder premium payment failed.'); }
    finally { setBusy(false); }
  }

  return <Card>
    <CardHead title="Delegated Testnet trade" />
    <p className="small muted">After you sign the exact trade intent with NEP-413, the restricted agent automatically creates the option and registers Escrow within the on-chain policy. Your principal wallet separately signs collateral; the holder signs premium. The agent cannot transfer either token.</p>
    <div className="col gap8 mt12">
      <label className="small">Holder NEAR account</label>
      <input value={holder} onChange={e => setHolder(e.target.value)} placeholder="buyer.shaydez.testnet" disabled={!!reply || busy} />
      <div className="grid g2 g-stay2" style={{ gap: 8 }}>
        <div><label className="small">Option</label><select value={kind} onChange={e => setKind(e.target.value as 'Call' | 'Put')} disabled={!!reply || busy}><option value="Call">Call</option><option value="Put">Put</option></select></div>
        <div><label className="small">Premium</label><input value="Configured by on-chain policy / server fixture" readOnly /></div>
        <div><label className="small">wNEAR amount (24 decimals)</label><input value={quantity} onChange={e => setQuantity(e.target.value)} disabled={!!reply || busy} /></div>
        <div><label className="small">Strike / put collateral (USDC, 6 decimals)</label><input value={strike} onChange={e => setStrike(e.target.value)} disabled={!!reply || busy} /></div>
      </div>
      <Button variant="gold" disabled={busy || !!reply || !holder.trim() || !/^\d+$/.test(quantity) || !/^\d+$/.test(strike)} onClick={createTrade}>{busy ? 'Agent executing…' : 'Create with delegated agent'}</Button>
    </div>
    {reply && <div className="struct mt12">
      <b>Option created · Escrow registration confirmed</b>
      <p className="small mt4">Position: {reply.trade.positionId} · Escrow: {reply.trade.escrowPositionId}</p>
      <p className="small">Agent create transaction: {reply.trade.createTransactionHash}</p>
      <p className="small">Escrow registration: {reply.trade.registrationTransactionHash}</p>
      {!collateral && <Button size="sm" variant="gold" disabled={busy} onClick={fundCollateral}>{busy ? 'Waiting…' : 'Principal: sign collateral transfer'}</Button>}
      {collateral && <p className="small">Principal collateral confirmed: {collateral.transactionHash}</p>}
      {collateral && !premiumPaid && <Button size="sm" variant="gold" disabled={busy} onClick={payPremium}>{busy ? 'Waiting…' : 'Holder: sign premium payment'}</Button>}
      {premiumPaid && <p className="small">Holder premium confirmed: {premiumPaid.transactionHash}</p>}
      {premiumPaid && <Button size="sm" onClick={() => { setReply(null); setCollateral(null); setPremiumPaid(null); }}>Create another trade</Button>}
    </div>}
    {error && <p className="small red mt8" role="alert">{error}</p>}
  </Card>;
}
