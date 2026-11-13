import { useEffect, useState } from 'react';
import { LuBan, LuKeyRound, LuPause, LuPlay } from 'react-icons/lu';
import { AgentPill } from '../components/status';
import { Badge, Banner, Button, Card, CardHead, KV, Modal, PageHead } from '../components/ui';
import { agentStatus, hydrateAgentMode, revokeAgent, useStore } from '../state/store';
import { getOnChainAgentExecutionMode, getOnChainAgentPolicy, getOnChainAssetMetadata, getOnChainEscrowTokenAccount, getOnChainUsdcAssetId, revokeOnChainAgentAccess, saveOnChainAgentPolicy, setOnChainAgentExecutionMode, type OnChainAssetMetadata } from '../lib/near-wallet';

function formatBaseUnits(value: string | number, decimals: number): string {
  const amount = BigInt(value);
  const scale = 10n ** BigInt(decimals);
  const whole = amount / scale;
  const fraction = (amount % scale).toString().padStart(decimals, '0').replace(/0+$/, '');
  return fraction ? whole.toString() + '.' + fraction : whole.toString();
}
function parseBaseUnits(value: string, decimals: number): string {
  if (!/^\d+(?:\.\d+)?$/.test(value)) throw new Error('Enter a valid positive decimal amount.');
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > decimals) throw new Error('This token supports at most ' + decimals + ' decimal places.');
  return (BigInt(whole) * (10n ** BigInt(decimals)) + BigInt((fraction + '0'.repeat(decimals)).slice(0, decimals) || '0')).toString();
}

export default function Agent() {
  const s = useStore();
  const st = agentStatus(s);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [chainPolicy, setChainPolicy] = useState<Awaited<ReturnType<typeof getOnChainAgentPolicy>>>(null);
  const [chainAssets, setChainAssets] = useState<{
    wnear: OnChainAssetMetadata | null;
    usdc: OnChainAssetMetadata | null;
    usdcAssetId: string;
    wnearTokenAccount: string | null;
    usdcTokenAccount: string | null;
  } | null>(null);
  const [chainDraft, setChainDraft] = useState({ maxUnderlyingWnear: '', maxPremiumUsdc: '', maxCollateralUsdc: '', maxOpenPositions: '', validityDays: '' });
  const wnearAssetId = 'nep141:wnear.tidepool-sandbox.testnet';
  const expectedUsdcAssetId = 'nep141:usdc.tidepool-sandbox.testnet';
  const expectedWnearTokenAccount = 'wnear.tidepool-sandbox.testnet';
  const expectedUsdcTokenAccount = 'usdc.tidepool-sandbox.testnet';
  const wnearReady = Boolean(chainAssets?.wnear?.asset_id === wnearAssetId && chainAssets.wnear.enabled &&
    chainAssets.wnear.decimals === 24 && chainAssets.wnearTokenAccount === expectedWnearTokenAccount);
  const usdcReady = Boolean(chainAssets?.usdcAssetId === expectedUsdcAssetId &&
    chainAssets.usdc?.asset_id === expectedUsdcAssetId && chainAssets.usdc.enabled &&
    chainAssets.usdc.decimals === 6 && chainAssets.usdcTokenAccount === expectedUsdcTokenAccount);
  const assetReady = wnearReady && usdcReady;
  const [chainLoading, setChainLoading] = useState(true);
  const [chainSaving, setChainSaving] = useState(false);
  const [chainRevoking, setChainRevoking] = useState(false);
  const [chainError, setChainError] = useState('');
  const [chainSuccess, setChainSuccess] = useState('');
  useEffect(() => {
    let active = true;
    const policyTask = Promise.all([getOnChainAgentPolicy(), getOnChainAgentExecutionMode()])
      .then(([policy, executionMode]) => {
        const delegated = policy?.enabled === true && executionMode === 'Delegated';
        hydrateAgentMode(delegated ? 'auto' : executionMode === 'Advisory' || executionMode === 'Education' ? 'advisory' : 'approval', policy?.enabled === false);
        if (!active) return;
        setChainPolicy(policy);
        if (policy) {
          const remaining = (BigInt(policy.expires_at_ns) - BigInt(Date.now()) * 1_000_000n + 86_400_000_000_000n - 1n) / 86_400_000_000_000n;
          setChainDraft({
            maxUnderlyingWnear: formatBaseUnits(policy.max_underlying_amount, 24),
            maxPremiumUsdc: formatBaseUnits(policy.max_premium_usdc, 6),
            maxCollateralUsdc: formatBaseUnits(policy.max_collateral_usdc, 6),
            maxOpenPositions: String(policy.max_open_positions),
            validityDays: String(remaining > 0n ? remaining : 1n),
          });
        }
      })
      .catch(error => { if (active) setChainError(error instanceof Error ? error.message : 'Could not read the on-chain agent policy.'); });
    const assetTask = (async () => {
      const [wnear, usdcAssetId] = await Promise.all([
        getOnChainAssetMetadata(wnearAssetId),
        getOnChainUsdcAssetId(),
      ]);
      const [usdc, wnearTokenAccount, usdcTokenAccount] = await Promise.all([
        getOnChainAssetMetadata(usdcAssetId),
        getOnChainEscrowTokenAccount(wnearAssetId),
        getOnChainEscrowTokenAccount(usdcAssetId),
      ]);
      if (active) setChainAssets({ wnear, usdc, usdcAssetId, wnearTokenAccount, usdcTokenAccount });
    })().catch(error => {
      if (active) setChainError(error instanceof Error ? error.message : 'Could not verify the on-chain asset and escrow registry.');
    });
    Promise.all([policyTask, assetTask]).finally(() => { if (active) setChainLoading(false); });
    return () => { active = false; };
  }, []);
  const saveChainPolicy = async () => {
    if (!assetReady) {
      setChainError('Automatic execution cannot be enabled yet. The OptionsContract must have wNEAR enabled at 24 decimals, USDC enabled at 6 decimals, and both NEP-141 escrow token-account mappings configured. This check moves no tokens.');
      return;
    }
    setChainSaving(true); setChainError(''); setChainSuccess('');
    try {
      const result = await saveOnChainAgentPolicy({
        allowedAssets: ['nep141:wnear.tidepool-sandbox.testnet'],
        maxUnderlyingAmount: parseBaseUnits(chainDraft.maxUnderlyingWnear, 24),
        maxPremiumUsdc: parseBaseUnits(chainDraft.maxPremiumUsdc, 6),
        maxCollateralUsdc: parseBaseUnits(chainDraft.maxCollateralUsdc, 6),
        maxOpenPositions: Number(chainDraft.maxOpenPositions),
        validityDays: Number(chainDraft.validityDays),
      });
      setChainPolicy(result.policy);
      hydrateAgentMode('auto');
      setChainSuccess('On-chain limits saved and bounded automatic execution enabled in the same wallet transaction. Transaction: ' + result.transactionHash);
    } catch (error) {
      setChainError(error instanceof Error ? error.message : 'Could not save the on-chain agent policy.');
    } finally { setChainSaving(false); }
  };
  const changeOnChainExecutionMode = async (mode: 'ManualApproval' | 'Delegated') => {
    setChainSaving(true); setChainError(''); setChainSuccess('');
    try {
      const transactionHash = await setOnChainAgentExecutionMode(mode);
      const confirmed = await getOnChainAgentExecutionMode();
      const policy = await getOnChainAgentPolicy();
      setChainPolicy(policy);
      if (confirmed !== mode) throw new Error('Execution mode did not verify on-chain.');
      if (mode === 'Delegated' && (!policy || policy.enabled !== true)) throw new Error('The policy is not enabled; automatic execution remains off.');
      hydrateAgentMode(mode === 'Delegated' ? 'auto' : 'approval', false);
      setChainSuccess((mode === 'Delegated' ? 'Bounded automatic execution resumed.' : 'Automatic execution paused in ManualApproval mode.') + ' Transaction: ' + transactionHash);
    } catch (error) {
      setChainError(error instanceof Error ? error.message : 'Could not update on-chain execution mode.');
    } finally { setChainSaving(false); }
  };
  const confirmOnChainRevoke = async () => {
    setChainRevoking(true); setChainError(''); setChainSuccess('');
    try {
      const transactionHash = await revokeOnChainAgentAccess();
      const policy = await getOnChainAgentPolicy();
      setChainPolicy(policy);
      if (!policy || policy.enabled !== false) throw new Error('The policy is not disabled on-chain.');
      revokeAgent();
      setChainSuccess('On-chain agent access revoked and enabled=false verified. Transaction: ' + transactionHash);
      setConfirmRevoke(false);
    } catch (error) {
      setChainError(error instanceof Error ? error.message : 'On-chain agent revocation failed.');
    } finally { setChainRevoking(false); }
  };


  return (
    <div className="page">
      <PageHead title="Agent permissions" sub="Configure the same AI agent you speak to in Assistant. Saving bounded on-chain limits enables automatic delegated execution; pause or revoke it here." actions={<AgentPill />} />

      {s.revoked && <Banner tone="danger"><b>Agent access is revoked.</b> The restricted key cannot execute. Create a new on-chain policy with the principal wallet to re-enable bounded execution.</Banner>}

      <Card className="ai">
        <div className="row between wrap gap16">
          <div className="col gap8">
            <div className="row gap8"><LuKeyRound size={18} className="gold" /><b className="big">Current authority</b></div>
            <div className="row gap8 wrap">
              <Badge tone="gold">{s.mode === 'auto' ? 'Automatic execution' : s.mode === 'approval' ? 'Approval mode' : 'Advisory mode'}</Badge>
              <Badge tone={s.authorization.status === 'delegated' ? 'amber' : s.authorization.status === 'revoked' ? 'red' : 'outline'}>{s.authorization.status === 'delegated' ? `Delegated · ${s.authorization.id}` : s.authorization.status === 'revoked' ? 'Revoked' : s.authorization.status === 'per-proposal' ? 'Per-proposal approval' : 'No trading authority'}</Badge>
              <Badge tone="outline">{st.label}</Badge>
            </div>
            <p className="small muted" style={{ maxWidth: '62ch' }}>{s.mode === 'auto' ? 'After one wallet-bound session authorization, the agent creates options and registers Escrow within your on-chain caps without per-trade approval. The principal separately signs collateral and the holder signs premium. No token transfers are delegated.' : s.mode === 'approval' ? 'Execution is in ManualApproval. The restricted agent will not create positions; resume Delegated mode only when the on-chain policy is enabled.' : 'The agent has no ability to trade. It answers and explains only.'}</p>
          </div>
          <div className="col gap8" style={{ minWidth: 200 }}>
            {s.mode === 'auto' ? <Button icon={<LuPause size={14} />} onClick={() => void changeOnChainExecutionMode('ManualApproval')} disabled={chainSaving}>Pause automatic execution</Button> : chainPolicy?.enabled ? <Button variant="gold" icon={<LuPlay size={14} />} onClick={() => void changeOnChainExecutionMode('Delegated')} disabled={chainSaving || s.revoked}>Resume automatic execution</Button> : null}
            <Button variant="danger" icon={<LuBan size={14} />} onClick={() => setConfirmRevoke(true)} disabled={!chainPolicy?.enabled || s.revoked || chainRevoking}>Revoke agent access</Button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="row between wrap">
          <div>
            <b>Automatic execution</b>
            <p className="small muted mt4">Saving your on-chain limits also activates Delegated mode in the same wallet transaction. It only stores permissions; it does not transfer USDC or wNEAR or create a position. The principal still signs collateral and the holder separately signs premium.</p>
          </div>
          <Badge tone={s.mode === 'auto' && !s.revoked ? 'green' : 'outline'}>{s.mode === 'auto' && !s.revoked ? 'Enabled on-chain' : 'Enable when saving limits'}</Badge>
        </div>
      </Card>

      <Card>
        <CardHead title="On-chain Testnet permissions" sub="These exact limits are enforced by OptionsContract for handel-agent.shaydez.testnet. Only your connected principal wallet can create or update them." right={chainPolicy ? <Badge tone={chainPolicy.enabled ? 'green' : 'red'}>{chainPolicy.enabled ? 'On-chain policy active' : 'Disabled'}</Badge> : <Badge tone="outline">Not configured</Badge>} />
        {chainLoading ? <p className="small muted">Reading policy from NEAR Testnet…</p> : (
          <>
            {chainPolicy && <div className="small muted mb12">Principal: <b>{chainPolicy.principal}</b> · Allowed asset: wNEAR · Current policy expiry: {new Date(Number(chainPolicy.expires_at_ns) / 1_000_000).toLocaleString()}</div>}
            <div className="banner info mb12">Only the Tidepool Testnet wNEAR token is allowlisted for this agent. These permissions do not authorize stock shares or live-market assets.</div>
            {chainAssets && <div className="row gap8 wrap mb12">
              <Badge tone={wnearReady ? 'green' : 'red'}>wNEAR: {wnearReady ? 'enabled · 24 decimals · escrow mapped' : 'asset or escrow mapping not ready'}</Badge>
              <Badge tone={usdcReady ? 'green' : 'red'}>USDC: {usdcReady ? 'enabled · 6 decimals · escrow mapped' : 'asset or escrow mapping not ready'}</Badge>
            </div>}
            {!chainLoading && !assetReady && <Banner tone="warn">The contract must confirm both enabled assets and their NEP-141 escrow token-account mappings before automatic policy creation. The contract owner may need to enable wNEAR and map its token account. This check is read-only and moves no tokens.</Banner>}
            <div className="grid g2">
              <div className="field"><span className="label">Maximum underlying per trade (wNEAR)</span><input className="input" type="number" min="0" step="0.000000000000000000000001" value={chainDraft.maxUnderlyingWnear} onChange={(e) => setChainDraft({ ...chainDraft, maxUnderlyingWnear: e.target.value })} placeholder="Set your wNEAR limit" /></div>
              <div className="field"><span className="label">Maximum premium per trade (USDC)</span><input className="input" type="number" min="0" step="0.000001" value={chainDraft.maxPremiumUsdc} onChange={(e) => setChainDraft({ ...chainDraft, maxPremiumUsdc: e.target.value })} placeholder="Set your USDC limit" /></div>
              <div className="field"><span className="label">Maximum put collateral per trade (USDC)</span><input className="input" type="number" min="0" step="0.000001" value={chainDraft.maxCollateralUsdc} onChange={(e) => setChainDraft({ ...chainDraft, maxCollateralUsdc: e.target.value })} placeholder="Set your USDC limit" /></div>
              <div className="field"><span className="label">Maximum open positions</span><input className="input" type="number" min="1" step="1" value={chainDraft.maxOpenPositions} onChange={(e) => setChainDraft({ ...chainDraft, maxOpenPositions: e.target.value })} placeholder="Set your position cap" /></div>
              <div className="field"><span className="label">Policy validity (days)</span><input className="input" type="number" min="1" max="365" step="1" value={chainDraft.validityDays} onChange={(e) => setChainDraft({ ...chainDraft, validityDays: e.target.value })} placeholder="1–365 days" /></div>
            </div>
            {chainError && <Banner tone="danger">{chainError}</Banner>}
            {chainSuccess && <Banner tone="info">{chainSuccess}</Banner>}
            <div className="row gap8 wrap mt12">
              <Button variant="gold" disabled={chainSaving || !assetReady || !chainDraft.maxUnderlyingWnear || !chainDraft.maxPremiumUsdc || !chainDraft.maxCollateralUsdc || !chainDraft.maxOpenPositions || !chainDraft.validityDays} onClick={() => void saveChainPolicy()}>{chainSaving ? 'Waiting for wallet…' : chainPolicy ? 'Update on-chain policy' : 'Create on-chain policy'}</Button>
              <span className="tiny muted">This submits one wallet-signed transaction that saves your limits and enables bounded Delegated execution together.</span>
            </div>
          </>
        )}
      </Card>

      <Modal open={confirmRevoke} onClose={() => setConfirmRevoke(false)} title="Revoke agent access?">
        <div className="col gap16">
          <p className="text2">This asks your principal wallet to sign the OptionsContract revoke_agent transaction. Handel will show revoked only after the contract confirms enabled=false. Existing positions are not cancelled.</p>
          <div className="row gap8"><Button block onClick={() => setConfirmRevoke(false)} disabled={chainRevoking}>Cancel</Button><Button block variant="danger" disabled={chainRevoking} onClick={() => void confirmOnChainRevoke()}>{chainRevoking ? 'Waiting for principal wallet…' : 'Sign on-chain revocation'}</Button></div>
        </div>
      </Modal>

    </div>
  );
}
