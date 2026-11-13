import { useEffect, useState } from 'react';
import { LuBan, LuCheck, LuLock, LuPause, LuPlay, LuKeyRound } from 'react-icons/lu';
import { ChecksList, SegBars } from '../components/status';
import { AgentPill } from '../components/status';
import { Badge, Banner, Button, Card, CardHead, KV, Modal, PageHead, QtyStepper, Seg, Sparkle, Switch } from '../components/ui';
import { ASSETS, DEFAULT_POLICY, fmtStamp, SUPPORTED_STRATEGIES, UNSUPPORTED_STRATEGIES } from '../data/mock';
import type { Mode, Policy } from '../data/types';
import { go } from '../router';
import { agentStatus, hydrateAgentMode, pauseAgent, resumeAgent, revokeAgent, reauthorize, setMode, updatePolicy, useStore } from '../state/store';
import { usd0 } from '../lib/pricing';
import { getOnChainAgentExecutionMode, getOnChainAgentPolicy, saveOnChainAgentPolicy, setOnChainAgentExecutionMode } from '../lib/near-wallet';

const MODES: { m: Mode; t: string; tag: string; pts: string[]; disabled?: boolean }[] = [
  { m: 'advisory', t: 'Advisory', tag: 'AI recommends', pts: ['Analyses markets and explains options', 'Recommends or rejects opportunities', 'Never executes. You act yourself'] },
  { m: 'approval', t: 'Approval', tag: 'You approve each trade', pts: ['Writes structured trade proposals', 'You approve or reject each one', 'Approved trades still pass every check'] },
  { m: 'auto', t: 'Automatic', tag: 'Bounded delegated execution', pts: ['Agent creates Call / Put options and registers Escrow within the on-chain policy', 'Principal wallet signs collateral; holder wallet signs premium', 'Restricted FunctionCall key cannot transfer tokens or perform sensitive holder actions'] },
];
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
  const [draft, setDraft] = useState<Policy>(s.policy);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [chainPolicy, setChainPolicy] = useState<Awaited<ReturnType<typeof getOnChainAgentPolicy>>>(null);
  const [chainDraft, setChainDraft] = useState({ maxUnderlyingWnear: '', maxPremiumUsdc: '', maxCollateralUsdc: '', maxOpenPositions: '', validityDays: '' });
  const [chainLoading, setChainLoading] = useState(true);
  const [chainSaving, setChainSaving] = useState(false);
  const [chainError, setChainError] = useState('');
  const [chainSuccess, setChainSuccess] = useState('');
  const [modeSaving, setModeSaving] = useState(false);
  useEffect(() => {
    let active = true;
    Promise.all([getOnChainAgentPolicy(), getOnChainAgentExecutionMode()]).then(([policy, executionMode]) => {
      hydrateAgentMode(executionMode === 'Delegated' ? 'auto' : executionMode === 'Advisory' || executionMode === 'Education' ? 'advisory' : 'approval');
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
    }).catch((error) => {
      if (active) setChainError(error instanceof Error ? error.message : 'Could not read the on-chain agent policy.');
    }).finally(() => { if (active) setChainLoading(false); });
    return () => { active = false; };
  }, []);
  const changeMode = async (mode: Mode) => {
    setModeSaving(true); setChainError(''); setChainSuccess('');
    const executionMode = mode === 'auto' ? 'Delegated' : mode === 'approval' ? 'ManualApproval' : 'Advisory';
    try {
      const tx = await setOnChainAgentExecutionMode(executionMode);
      setMode(mode);
      setChainSuccess(executionMode + ' mode verified on-chain. Transaction: ' + tx);
    } catch (error) {
      setChainError(error instanceof Error ? error.message : 'Could not update execution mode on-chain.');
    } finally { setModeSaving(false); }
  };
  const saveChainPolicy = async () => {
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
      setChainSuccess('On-chain policy verified. Transaction: ' + result.transactionHash);
    } catch (error) {
      setChainError(error instanceof Error ? error.message : 'Could not save the on-chain agent policy.');
    } finally { setChainSaving(false); }
  };
  const dirty = JSON.stringify(draft) !== JSON.stringify(s.policy);
  const tgl = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const perm = s.activity.filter((a) => a.kind === 'permission_change').slice(0, 4);
  const tradable = ASSETS.filter((a) => a.optionsSupported);
  const active = [
    `${draft.assets.length ? draft.assets.join(', ') : 'No assets'}`, draft.sides.length ? draft.sides.join(' + ') + 's' : 'No option types', `Max ${draft.maxContracts} contracts`, `Max ${usd0(draft.maxPremiumUsd)} premium`, `${draft.expiryMinDays}–${draft.expiryMaxDays} days to expiry`, `Max ${draft.maxExposurePct}% exposure`, draft.requireVerified ? 'Verified pricing only' : 'Estimates allowed',
  ];

  return (
    <div className="page">
      <PageHead title="Agent permissions" sub="Configure the same AI agent you speak to in Assistant. Set its on-chain limits, execution mode and revocation; this screen is not a separate agent. Wallet connection alone grants nothing." actions={<AgentPill />} />

      {s.revoked && <Banner tone="danger" action={<Button size="sm" variant="gold" onClick={reauthorize}>Re-enable in Advisory</Button>}><b>Agent access is revoked.</b> The agent cannot analyse, propose or act until you re-enable it.</Banner>}
      {s.paused && !s.revoked && <Banner tone="warn" action={<Button size="sm" variant="gold" onClick={resumeAgent}>Resume</Button>}><b>The agent is paused.</b> Your permissions are unchanged, but nothing runs until you resume.</Banner>}
      {s.demo.agentError && <Banner tone="danger"><b>Agent error.</b> The market-data adapter timed out. The agent abstains rather than act on missing evidence.</Banner>}

      <Card className="ai">
        <div className="row between wrap gap16">
          <div className="col gap8">
            <div className="row gap8"><LuKeyRound size={18} className="gold" /><b className="big">Current authority</b></div>
            <div className="row gap8 wrap">
              <Badge tone="gold">{s.mode === 'auto' ? 'Automatic execution' : s.mode === 'approval' ? 'Approval mode' : 'Advisory mode'}</Badge>
              <Badge tone={s.authorization.status === 'delegated' ? 'amber' : s.authorization.status === 'revoked' ? 'red' : 'outline'}>{s.authorization.status === 'delegated' ? `Delegated · ${s.authorization.id}` : s.authorization.status === 'revoked' ? 'Revoked' : s.authorization.status === 'per-proposal' ? 'Per-proposal approval' : 'No trading authority'}</Badge>
              <Badge tone="outline">{st.label}</Badge>
            </div>
            <p className="small muted" style={{ maxWidth: '62ch' }}>{s.mode === 'auto' ? 'The agent can create options and register Escrow automatically within your on-chain caps. The principal must still sign collateral and the holder must sign premium. No token transfers are delegated.' : s.mode === 'approval' ? 'The agent writes proposals. Nothing is funded until you approve it in your wallet, and approved trades are checked against the on-chain contract and escrow.' : 'The agent has no ability to trade. It analyses and recommends only.'}</p>
          </div>
          <div className="col gap8" style={{ minWidth: 200 }}>
            {s.paused ? <Button variant="gold" icon={<LuPlay size={14} />} onClick={resumeAgent} disabled={s.revoked}>Resume agent</Button> : <Button icon={<LuPause size={14} />} onClick={pauseAgent} disabled={s.revoked}>Pause automation</Button>}
            <Button variant="danger" icon={<LuBan size={14} />} onClick={() => setConfirmRevoke(true)} disabled={s.revoked}>Revoke agent access</Button>
          </div>
        </div>
      </Card>

      <div className="grid g3">
        {MODES.map((o) => (
          <button key={o.m} className={`radio-card ${s.mode === o.m && !s.revoked ? 'on' : ''}`} onClick={() => void changeMode(o.m)} aria-pressed={s.mode === o.m} disabled={modeSaving}>
            <div className="row between"><b className="big">{o.t}</b>{s.mode === o.m && !s.revoked ? <Badge tone="gold" sm><LuCheck size={11} />Current</Badge> : <Badge tone="outline" sm>{o.tag}</Badge>}</div>
            <ul>{o.pts.map((p) => <li key={p}><LuCheck size={13} className="green" />{p}</li>)}</ul>
          </button>
        ))}
      </div>

      <div className="grid g-main">
        <Card>
          <CardHead title="Limits the agent must respect" sub="Applied by the policy engine to every agent action, whatever the AI says." right={<div className="row gap8">{dirty && <Button size="sm" onClick={() => setDraft(s.policy)}>Discard</Button>}<Button size="sm" variant="gold" disabled={!dirty} onClick={() => updatePolicy(draft)}>Save policy</Button></div>} />
          <div className="col gap20" style={{ gap: 20 }}>
            <div className="field"><span className="label">Allowed assets</span><div className="pill-row">{tradable.map((a) => <button key={a.sym} className={`chip ${draft.assets.includes(a.sym) ? 'on' : ''}`} onClick={() => setDraft({ ...draft, assets: tgl(draft.assets, a.sym) })} aria-pressed={draft.assets.includes(a.sym)}>{a.sym}</button>)}</div></div>
            <div className="field"><span className="label">Option types</span><div className="pill-row">{(['call', 'put'] as const).map((x) => <button key={x} className={`chip ${draft.sides.includes(x) ? 'on' : ''}`} onClick={() => setDraft({ ...draft, sides: tgl(draft.sides, x), strategies: tgl(draft.strategies, x === 'call' ? 'Long call' : 'Long put') })}>{x === 'call' ? 'Calls' : 'Puts'}</button>)}</div></div>
            <div className="field"><span className="label">Strategies</span><div className="pill-row">{SUPPORTED_STRATEGIES.map((x) => <button key={x} className={`chip ${draft.strategies.includes(x) ? 'on' : ''}`} onClick={() => setDraft({ ...draft, strategies: tgl(draft.strategies, x) })}>{x}</button>)}{UNSUPPORTED_STRATEGIES.map((x) => <button key={x} className="chip" disabled title="Not implemented by the backend yet"><LuLock size={11} />{x}</button>)}</div></div>
            <div className="grid g2">
              <div className="field"><span className="label">Max contracts per trade</span><QtyStepper value={draft.maxContracts} onChange={(n) => setDraft({ ...draft, maxContracts: n })} max={50} /></div>
              <div className="field"><span className="label">Max premium per trade: {usd0(draft.maxPremiumUsd)}</span><input className="range" type="range" min={250} max={10000} step={250} value={draft.maxPremiumUsd} onChange={(e) => setDraft({ ...draft, maxPremiumUsd: Number(e.target.value) })} aria-label="Max premium" /></div>
              <div className="field"><span className="label">Earliest expiry: {draft.expiryMinDays} days</span><input className="range" type="range" min={1} max={30} value={draft.expiryMinDays} onChange={(e) => setDraft({ ...draft, expiryMinDays: Math.min(Number(e.target.value), draft.expiryMaxDays - 1) })} aria-label="Earliest expiry" /></div>
              <div className="field"><span className="label">Latest expiry: {draft.expiryMaxDays} days</span><input className="range" type="range" min={7} max={120} value={draft.expiryMaxDays} onChange={(e) => setDraft({ ...draft, expiryMaxDays: Math.max(Number(e.target.value), draft.expiryMinDays + 1) })} aria-label="Latest expiry" /></div>
              <div className="field"><span className="label">Exposure cap: {draft.maxExposurePct}% of balance</span><input className="range" type="range" min={5} max={100} step={5} value={draft.maxExposurePct} onChange={(e) => setDraft({ ...draft, maxExposurePct: Number(e.target.value) })} aria-label="Exposure cap" /></div>
              <div className="field"><span className="label">Require verified pricing</span><div className="row gap8"><Switch on={draft.requireVerified} onChange={(v) => setDraft({ ...draft, requireVerified: v })} label="Require verified pricing" /><span className="small muted">{draft.requireVerified ? 'Estimates are blocked' : 'Estimates allowed'}</span></div></div>
            </div>
            <button className="link small" style={{ alignSelf: 'flex-start' }} onClick={() => setDraft({ ...DEFAULT_POLICY })}>Restore defaults</button>
          </div>
        </Card>
        <div className="col gap16">
          <Card>
            <CardHead title="Active restrictions" sub={dirty ? 'Unsaved changes shown' : 'Currently enforced'} />
            <div className="pill-row">{active.map((a) => <Badge key={a} tone="outline">{a}</Badge>)}</div>
            <p className="tiny faint mt12">Pricing older than {s.policy.maxPricingAgeMin} minutes is always rejected.</p>
          </Card>
          <Card>
            <CardHead title="Recent agent actions" right={<button className="link small" onClick={() => go('/app/activity')}>All</button>} />
            {s.agentRuns.length === 0 ? <p className="small muted">No agent activity yet.</p> : s.agentRuns.slice(0, 5).map((r) => (
              <div key={r.id} className="row gap12 between" style={{ padding: '9px 0', borderBottom: '1px solid var(--line)' }}>
                <div className="grow"><div className="semi small ellipsis">{r.title}</div><div className="tiny faint">{fmtStamp(r.ts)}</div><div className="mt4"><SegBars checks={r.checks} /></div></div>
                <Badge sm tone={r.result === 'executed' ? 'green' : r.result === 'proposed' ? 'gold' : r.result === 'rejected' ? 'red' : 'outline'}>{r.result === 'rejected' ? 'Blocked' : r.result === 'abstained' ? 'No trade' : r.result}</Badge>
              </div>
            ))}
          </Card>
          <Card>
            <CardHead title="Permission changes" />
            {perm.length === 0 ? <p className="small muted">No changes yet.</p> : perm.map((a) => <KV key={a.id} k={<span className="text2">{a.title}</span>} v={<span className="tiny muted">{fmtStamp(a.ts)}</span>} />)}
          </Card>
        </div>
      </div>

      <Card>
        <CardHead title="On-chain Testnet permissions" sub="These exact limits are enforced by OptionsContract for handel-agent.shaydez.testnet. Only your connected principal wallet can create or update them." right={chainPolicy ? <Badge tone={chainPolicy.enabled ? 'green' : 'red'}>{chainPolicy.enabled ? 'On-chain policy active' : 'Disabled'}</Badge> : <Badge tone="outline">Not configured</Badge>} />
        {chainLoading ? <p className="small muted">Reading policy from NEAR Testnet…</p> : (
          <>
            {chainPolicy && <div className="small muted mb12">Principal: <b>{chainPolicy.principal}</b> · Allowed asset: wNEAR · Current policy expiry: {new Date(Number(chainPolicy.expires_at_ns) / 1_000_000).toLocaleString()}</div>}
            <div className="banner info mb12">All demo market symbols currently use the same Tidepool Testnet wNEAR token. The contract policy therefore authorizes that token, not real NVDA/AAPL/MSFT shares.</div>
            <div className="grid g2">
              <div className="field"><span className="label">Maximum underlying per proposal (wNEAR)</span><input className="input" type="number" min="0" step="0.000000000000000000000001" value={chainDraft.maxUnderlyingWnear} onChange={(e) => setChainDraft({ ...chainDraft, maxUnderlyingWnear: e.target.value })} placeholder="Set your wNEAR limit" /></div>
              <div className="field"><span className="label">Maximum premium per proposal (USDC)</span><input className="input" type="number" min="0" step="0.000001" value={chainDraft.maxPremiumUsdc} onChange={(e) => setChainDraft({ ...chainDraft, maxPremiumUsdc: e.target.value })} placeholder="Set your USDC limit" /></div>
              <div className="field"><span className="label">Maximum put collateral per proposal (USDC)</span><input className="input" type="number" min="0" step="0.000001" value={chainDraft.maxCollateralUsdc} onChange={(e) => setChainDraft({ ...chainDraft, maxCollateralUsdc: e.target.value })} placeholder="Set your USDC limit" /></div>
              <div className="field"><span className="label">Maximum open positions</span><input className="input" type="number" min="1" step="1" value={chainDraft.maxOpenPositions} onChange={(e) => setChainDraft({ ...chainDraft, maxOpenPositions: e.target.value })} placeholder="Set your position cap" /></div>
              <div className="field"><span className="label">Policy validity (days)</span><input className="input" type="number" min="1" max="365" step="1" value={chainDraft.validityDays} onChange={(e) => setChainDraft({ ...chainDraft, validityDays: e.target.value })} placeholder="1–365 days" /></div>
            </div>
            {chainError && <Banner tone="danger">{chainError}</Banner>}
            {chainSuccess && <Banner tone="info">{chainSuccess}</Banner>}
            <div className="row gap8 wrap mt12">
              <Button variant="gold" disabled={chainSaving || !chainDraft.maxUnderlyingWnear || !chainDraft.maxPremiumUsdc || !chainDraft.maxCollateralUsdc || !chainDraft.maxOpenPositions || !chainDraft.validityDays} onClick={() => void saveChainPolicy()}>{chainSaving ? 'Waiting for wallet…' : chainPolicy ? 'Update on-chain policy' : 'Create on-chain policy'}</Button>
              <span className="tiny muted">This submits one wallet-signed transaction. New policies default to Manual Approval. Select Automatic above to switch the on-chain mode to Delegated.</span>
            </div>
          </>
        )}
      </Card>

undefined      <Modal open={confirmRevoke} onClose={() => setConfirmRevoke(false)} title="Revoke agent access?">
        <div className="col gap16">
          <p className="text2">This removes all delegated authority and returns the agent to Advisory. Positions you hold are not affected. You can re-enable the agent later.</p>
          <div className="row gap8"><Button block onClick={() => setConfirmRevoke(false)}>Cancel</Button><Button block variant="danger" onClick={() => { revokeAgent(); setConfirmRevoke(false); }}>Revoke access</Button></div>
        </div>
      </Modal>
      <span className="hide"><Seg value="a" onChange={() => {}} options={[{ v: 'a', label: '' }]} /><ChecksList checks={[]} /><Sparkle /></span>
    </div>
  );
}
