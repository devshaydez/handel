import { useState } from 'react';
import { createAdvisoryProposal, type AdvisoryProposalReply } from '../lib/handel-api';
import {
  authorizeDelegatedPremiumPayment,
  connectNearWallet,
  currentNearAccount,
  signAgentProposalIntent,
  signNearContractCall,
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
  const [reply, setReply] = useState<AdvisoryProposalReply | null>(null);
  const [collateral, setCollateral] = useState<WalletTransactionResult | null>(null);
  const [premiumPaid, setPremiumPaid] = useState<WalletTransactionResult | null>(null);

  async function createProposal() {
    setBusy(true); setError('');
    try {
      let principal = await currentNearAccount();
      if (!principal) principal = (await connectNearWallet()).accountId;
      const expiryNs = (BigInt(Date.now() + 7 * 86_400_000) * 1_000_000n).toString();
      const terms = { principal, holder: holder.trim(), kind, assetId: ASSET_ID, quantity, strike, premium: PREMIUM, expiryNs };
      const authorization = await signAgentProposalIntent(terms);
      const result = await createAdvisoryProposal({
        principal,
        holder: holder.trim(),
        authorization,
        request: { type: kind, assetId: ASSET_ID, quantity, strike, expiryNs, objective: 'Assistant-created Testnet proposal using the configured synthetic wNEAR asset and demo premium.' },
      });
      setReply(result); setCollateral(null); setPremiumPaid(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Proposal submission failed.'); }
    finally { setBusy(false); }
  }

  async function approveAndFund() {
    if (!reply) return;
    setBusy(true); setError('');
    try {
      const result = await signNearContractCall(reply.prepared.method, reply.prepared.args);
      setCollateral(result);
    } catch (e) { setError(e instanceof Error ? e.message : 'Principal approval or collateral funding failed.'); }
    finally { setBusy(false); }
  }

  async function payPremium() {
    if (!reply || !collateral?.positionId || !collateral.escrowPositionId) return;
    setBusy(true); setError('');
    try {
      const result = await authorizeDelegatedPremiumPayment(collateral.positionId, collateral.escrowPositionId);
      setPremiumPaid(result);
    } catch (e) { setError(e instanceof Error ? e.message : 'Holder premium payment failed.'); }
    finally { setBusy(false); }
  }

  return <Card>
    <CardHead title="Create a real Testnet proposal" />
    <p className="small muted">This separate execution form uses the synthetic Tidepool wNEAR asset—not the demo equity tickers above. The connected principal signs the exact proposal terms. The holder must be a different NEAR account.</p>
    <div className="col gap8 mt12">
      <label className="small">Holder NEAR account</label>
      <input value={holder} onChange={e => setHolder(e.target.value)} placeholder="buyer.shaydez.testnet" disabled={!!reply || busy} />
      <div className="grid g2 g-stay2" style={{gap:8}}>
        <div><label className="small">Option</label><select value={kind} onChange={e => setKind(e.target.value as 'Call' | 'Put')} disabled={!!reply || busy}><option value="Call">Call</option><option value="Put">Put</option></select></div>
        <div><label className="small">Premium (USDC base units)</label><input value={PREMIUM} readOnly /></div>
        <div><label className="small">wNEAR amount (24 decimals)</label><input value={quantity} onChange={e => setQuantity(e.target.value)} disabled={!!reply || busy} /></div>
        <div><label className="small">Strike / put collateral (USDC, 6 decimals)</label><input value={strike} onChange={e => setStrike(e.target.value)} disabled={!!reply || busy} /></div>
      </div>
      <Button variant="gold" disabled={busy || !!reply || !holder.trim() || !quantity.trim() || !strike.trim()} onClick={createProposal}>{busy ? 'Working…' : 'Sign and submit proposal'}</Button>
    </div>
    {reply && <div className="struct mt12">
      <b>On-chain proposal pending principal approval</b>
      <p className="small mt4">Proposal: {reply.proposal.proposalId}</p>
      <p className="small">Writer / principal: {reply.proposal.principal}</p>
      <p className="small">Holder: {reply.proposal.holder}</p>
      <p className="small">Position: {reply.prepared.args.position_id}</p>
      <p className="small">Agent transaction: {reply.agentSubmission.transactionHash}</p>
      {!collateral && <Button size="sm" variant="gold" disabled={busy} onClick={approveAndFund}>{busy ? 'Waiting…' : 'Principal: approve and fund collateral'}</Button>}
      {collateral && <p className="small">Collateral transaction confirmed: {collateral.transactionHash}. Escrow position: {collateral.escrowPositionId}</p>}
      {collateral && !premiumPaid && <Button size="sm" variant="gold" disabled={busy} onClick={payPremium}>{busy ? 'Waiting…' : 'Holder: pay premium from holder wallet'}</Button>}
      {premiumPaid && <p className="small">Holder premium transaction: {premiumPaid.transactionHash}. Escrow confirms premium settlement.</p>}
      {premiumPaid && <Button size="sm" onClick={() => { setReply(null); setCollateral(null); setPremiumPaid(null); }}>Create another proposal</Button>}
    </div>}
    {error && <p className="small red mt8" role="alert">{error}</p>}
  </Card>;
}
