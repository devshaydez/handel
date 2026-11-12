import { useState } from 'react';
import { LuBan, LuCheck, LuLock, LuPause, LuPlay, LuKeyRound } from 'react-icons/lu';
import { ChecksList, SegBars } from '../components/status';
import { AgentPill } from '../components/status';
import { Badge, Banner, Button, Card, CardHead, KV, Modal, PageHead, QtyStepper, Seg, Sparkle, Switch } from '../components/ui';
import { ASSETS, DEFAULT_POLICY, fmtStamp, SUPPORTED_STRATEGIES, UNSUPPORTED_STRATEGIES } from '../data/mock';
import type { Mode, Policy } from '../data/types';
import { go } from '../router';
import { agentStatus, pauseAgent, resumeAgent, revokeAgent, reauthorize, runAgentCycle, setMode, updatePolicy, useStore } from '../state/store';
import { usd0 } from '../lib/pricing';

const MODES: { m: Mode; t: string; tag: string; pts: string[] }[] = [
  { m: 'advisory', t: 'Advisory', tag: 'AI recommends', pts: ['Analyses markets and explains options', 'Recommends or rejects opportunities', 'Never executes. You act yourself'] },
  { m: 'approval', t: 'Approval', tag: 'You approve each trade', pts: ['Writes structured trade proposals', 'You approve or reject each one', 'Approved trades still pass every check'] },
  { m: 'auto', t: 'Automatic', tag: 'Within your limits', pts: ['Executes only what your policy allows', 'Every trade passes the policy engine', 'You can pause or revoke at any time'] },
];

export default function Agent() {
  const s = useStore();
  const st = agentStatus(s);
  const [draft, setDraft] = useState<Policy>(s.policy);
  const [confirmAuto, setConfirmAuto] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(s.policy);
  const tgl = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const perm = s.activity.filter((a) => a.kind === 'permission_change').slice(0, 4);
  const tradable = ASSETS.filter((a) => a.optionsSupported);
  const active = [
    `${draft.assets.length ? draft.assets.join(', ') : 'No assets'}`, draft.sides.length ? draft.sides.join(' + ') + 's' : 'No option types', `Max ${draft.maxContracts} contracts`, `Max ${usd0(draft.maxPremiumUsd)} premium`, `${draft.expiryMinDays}–${draft.expiryMaxDays} days to expiry`, `Max ${draft.maxExposurePct}% exposure`, draft.requireVerified ? 'Verified pricing only' : 'Estimates allowed',
  ];

  return (
    <div className="page">
      <PageHead title="Agent permissions" sub="Decide exactly what the AI may do. Wallet connection alone grants nothing, and you can stop the agent at any time." actions={<AgentPill />} />

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
            <p className="small muted" style={{ maxWidth: '62ch' }}>{s.mode === 'auto' ? 'The agent may open trades that satisfy every limit below. Each one still passes the independent policy engine. You can pause or revoke with one click and nothing the agent holds can prevent that.' : s.mode === 'approval' ? 'The agent writes proposals. Nothing is submitted until you approve it, and approved trades are re-checked.' : 'The agent has no ability to trade. It analyses and recommends only.'}</p>
          </div>
          <div className="col gap8" style={{ minWidth: 200 }}>
            {s.paused ? <Button variant="gold" icon={<LuPlay size={14} />} onClick={resumeAgent} disabled={s.revoked}>Resume agent</Button> : <Button icon={<LuPause size={14} />} onClick={pauseAgent} disabled={s.revoked}>Pause automation</Button>}
            <Button variant="danger" icon={<LuBan size={14} />} onClick={() => setConfirmRevoke(true)} disabled={s.revoked}>Revoke agent access</Button>
            <Button size="sm" variant="ghost" onClick={runAgentCycle} disabled={s.agentActivity !== 'idle'}>Run a demo agent cycle</Button>
          </div>
        </div>
      </Card>

      <div className="grid g3">
        {MODES.map((o) => (
          <button key={o.m} className={`radio-card ${s.mode === o.m && !s.revoked ? 'on' : ''}`} onClick={() => (o.m === 'auto' ? setConfirmAuto(true) : setMode(o.m))} aria-pressed={s.mode === o.m}>
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

      <Modal open={confirmAuto} onClose={() => setConfirmAuto(false)} title="Enable automatic execution?">
        <div className="col gap16">
          <p className="text2">The agent will be allowed to open option trades <b>without asking you first</b>, but only inside the limits you set. Each trade still has to pass the independent policy engine.</p>
          <div className="card" style={{ padding: 12 }}>{active.map((a) => <div key={a} className="row gap8 small" style={{ padding: '3px 0' }}><LuCheck size={13} className="green" />{a}</div>)}</div>
          <Banner tone="gold">You can pause or revoke at any time. That always works, whatever the agent is doing.</Banner>
          <div className="row gap8"><Button block onClick={() => setConfirmAuto(false)}>Cancel</Button><Button block variant="gold" onClick={() => { if (dirty) updatePolicy(draft); setMode('auto'); setConfirmAuto(false); }}>Enable automatic mode</Button></div>
        </div>
      </Modal>
      <Modal open={confirmRevoke} onClose={() => setConfirmRevoke(false)} title="Revoke agent access?">
        <div className="col gap16">
          <p className="text2">This removes all delegated authority and returns the agent to Advisory. Positions you hold are not affected. You can re-enable the agent later.</p>
          <div className="row gap8"><Button block onClick={() => setConfirmRevoke(false)}>Cancel</Button><Button block variant="danger" onClick={() => { revokeAgent(); setConfirmRevoke(false); }}>Revoke access</Button></div>
        </div>
      </Modal>
      <span className="hide"><Seg value="a" onChange={() => {}} options={[{ v: 'a', label: '' }]} /><ChecksList checks={[]} /><Sparkle /></span>
    </div>
  );
}
