import { useEffect, useState } from 'react';
import { LuLock } from 'react-icons/lu';
import { PayoffChart } from '../components/charts';
import { SignModal } from '../components/SignModal';
import { ChecksList, CheckVerdict, EvidenceList, SegBars, TradeStatus } from '../components/status';
import { Badge, Banner, Button, Card, CardHead, EmptyState, KV, Modal, PageHead, QualityBadge, Sparkle, SymBadge, Tabs, Term } from '../components/ui';
import { assetBySym, fmtDate, fmtStamp, makeContract } from '../data/mock';
import type { Proposal, ProposalStatus } from '../data/types';
import { go, useRoute } from '../router';
import { executeProposal, proposalChecks, rejectProposal, useStore } from '../state/store';
import { overall } from '../lib/policy';
import { createAdvisoryProposal } from '../lib/handel-api';
import { signNearContractCall } from '../lib/near-wallet';
import { CONTRACT_SIZE, breakeven, usd, usd0 } from '../lib/pricing';

const ST: Record<ProposalStatus, { l: string; t: 'gold' | 'green' | 'red' | 'blue' | 'amber' }> = { pending: { l: 'Awaiting approval', t: 'amber' }, approved: { l: 'Approved', t: 'blue' }, executed: { l: 'Executed', t: 'green' }, rejected: { l: 'Rejected', t: 'red' }, blocked: { l: 'Blocked by policy', t: 'red' } };
const REASONS = ['Too risky', 'Expiry too short', 'Disagree with the thesis', 'Position too large', 'Other'];

export default function Proposals() {
  const s = useStore();
  const r = useRoute();
  const [tab, setTab] = useState<'pending' | 'history'>('pending');
  const [sel, setSel] = useState<string | null>(r.query.get('id'));
  const [sign, setSign] = useState(false);
  const [rej, setRej] = useState(false);
  const [reason, setReason] = useState(REASONS[0]);
  const [section, setSection] = useState<'reasoning' | 'evidence' | 'risks' | 'alts'>('reasoning');
  const [preparedCall, setPreparedCall] = useState<{ method: 'approve_agent_proposal'; args: Record<string, string>; rationale: string; risks: string[]; aiModel: string } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [prepareError, setPrepareError] = useState('');

  const prepareApproval = async (proposal: Proposal) => {
    if (!s.wallet.connected || !s.wallet.account) { setPrepareError('Connect your NEAR Testnet wallet first.'); return; }
    setPreparing(true);
    setPrepareError('');
    try {
      const quantity = (BigInt(proposal.qty) * 100n * 10n ** 24n).toString();
      const strike = (BigInt(Math.round(proposal.strike * 100)) * BigInt(proposal.qty) * 1_000_000n).toString();
      const expiryNs = (BigInt(Date.parse(proposal.expiry + 'T23:59:59Z')) * 1_000_000n).toString();
      const reply = await createAdvisoryProposal({
        holder: s.wallet.account,
        request: {
          type: proposal.side === 'call' ? 'Call' : 'Put',
          // All demo equity symbols map to verified Tidepool wNEAR test token.
          // This is a synthetic testnet underlying, not a tokenized stock.
          assetId: 'nep141:wnear.tidepool-sandbox.testnet',
          quantity,
          strike,
          expiryNs,
          objective: `Create a simulated ${proposal.strategy} on ${proposal.sym}. Demo-only equity reference; underlying token is testnet wNEAR. Thesis: ${proposal.headline}. ${proposal.reasoning.join(' ')}`,
        },
      });
      setPreparedCall({ ...reply.prepared, rationale: reply.proposal.rationale, risks: reply.proposal.risks, aiModel: reply.ai.model });
      setSign(true);
    } catch (error) {
      setPrepareError(error instanceof Error ? error.message : 'Could not prepare the AI proposal.');
    } finally {
      setPreparing(false);
    }
  };

  const pending = s.proposals.filter((p) => p.status === 'pending');
  const history = s.proposals.filter((p) => p.status !== 'pending');
  const list = tab === 'pending' ? pending : history;
  useEffect(() => { const q = r.query.get('id'); if (q) { setSel(q); const p = s.proposals.find((x) => x.id === q); if (p) setTab(p.status === 'pending' ? 'pending' : 'history'); } }, [r.query.get('id')]); // eslint-disable-line
  const p = s.proposals.find((x) => x.id === sel) ?? list[0] ?? null;

  return (
    <div className="page">
      <PageHead title="Approval Centre" sub="Review what the AI proposes. Approving never skips the independent pricing, collateral and policy checks." />
      {s.mode === 'advisory' && !s.revoked && <Banner tone="info" action={<Button size="sm" onClick={() => go('/app/agent')}>Change mode</Button>}>You’re in <b>Advisory</b> mode. The agent’s ideas appear as recommendations. Switch to Approval mode to approve them here.</Banner>}
      <Tabs value={tab} onChange={(v) => { setTab(v); setSel(null); }} tabs={[{ v: 'pending', label: 'Pending', n: pending.length }, { v: 'history', label: 'Approved and rejected', n: history.length }]} />
      {list.length === 0 ? (
        <Card><EmptyState title={tab === 'pending' ? 'Nothing needs your approval' : 'No past proposals'} body={tab === 'pending' ? 'When the AI finds a setup that fits your policy, its proposal shows up here. Sometimes there’s nothing worth proposing, and that’s fine.' : 'Proposals you approve or reject are kept here.'} action={<Button onClick={() => go('/app/agent')}>Review agent settings</Button>} /></Card>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0,340px) minmax(0,1fr)' }}>
          <div className="col gap8">
            {list.map((x) => {
              const sc = ST[x.status];
              return (
                <button key={x.id} className={`list-item ${p?.id === x.id ? 'on' : ''}`} onClick={() => setSel(x.id)}>
                  <SymBadge sym={x.sym} />
                  <div className="grow"><div className="semi">{x.strategy} {x.sym} {x.strike}</div><div className="tiny muted">{x.qty} × {fmtDate(x.expiry)}</div><div className="row gap8 mt4"><Badge sm tone={sc.t}>{sc.l}</Badge><span className="tiny faint">{x.id}</span></div></div>
                </button>
              );
            })}
          </div>
          <div className="proposal-pane">{p && <Detail p={p} section={section} setSection={setSection} onApprove={() => { void prepareApproval(p); }} onReject={() => setRej(true)} />}</div>
        </div>
      )}
      <style>{`@media (max-width: 900px){ .page .grid[style*="340px"]{ grid-template-columns: minmax(0,1fr) !important; } }`}</style>

      {prepareError && <Banner tone="danger">{prepareError}</Banner>}
      {p && preparedCall && <SignModal open={sign} onClose={() => { setSign(false); setPreparedCall(null); }} execute={() => signNearContractCall(preparedCall.method, preparedCall.args)} onSigned={async (result) => { const premiumPerShare = Number(preparedCall.args.premium_amount_usdc) / 1_000_000 / (100 * p.qty); const recorded = executeProposal(p.id, result, premiumPerShare); if (recorded.ok) { setSign(false); setPreparedCall(null); setTab('history'); } }} action={`Create and approve ${p.strategy.toLowerCase()} on ${p.sym}`} rows={[{ k: 'Underlying', v: 'Tidepool Testnet wNEAR (demo proxy)' }, { k: 'Contract', v: `${p.strike} ${p.side} · ${fmtDate(p.expiry)}` }, { k: 'Quantity', v: String(p.qty) }, { k: 'Premium', v: 'Configured demo fixture' }, { k: 'AI model', v: preparedCall.aiModel + ' · response verified' }, { k: 'AI rationale', v: preparedCall.rationale }, { k: 'AI risks', v: preparedCall.risks.join(' · ') }]} />}
      {preparing && <div className="small muted">Preparing AI proposal and demo pricing…</div>}
      <Modal open={rej} onClose={() => setRej(false)} title="Reject this proposal?">
        <div className="col gap16">
          <div className="field"><span className="label">Reason (kept in your journal)</span><select className="select" value={reason} onChange={(e) => setReason(e.target.value)}>{REASONS.map((x) => <option key={x}>{x}</option>)}</select></div>
          <div className="row gap8"><Button block onClick={() => setRej(false)}>Cancel</Button><Button block variant="danger" onClick={() => { if (p) rejectProposal(p.id, reason.toLowerCase()); setRej(false); setTab('history'); }}>Reject proposal</Button></div>
        </div>
      </Modal>
    </div>
  );
}

function Detail({ p, section, setSection, onApprove, onReject }: { p: Proposal; section: string; setSection: (s: 'reasoning' | 'evidence' | 'risks' | 'alts') => void; onApprove: () => void; onReject: () => void }) {
  const s = useStore();
  const a = assetBySym(p.sym)!;
  const checks = proposalChecks(p, s);
  const verdict = overall(checks);
  const c = makeContract(p.sym, p.expiry, p.side, p.strike, s.demo.feed);
  const live = c.ask ?? p.premium;
  const total = live * CONTRACT_SIZE * p.qty;
  const sc = ST[p.status];
  const decided = p.status !== 'pending';
  const policyStatus = verdict === 'fail' ? { t: 'Not authorized', tone: 'red' as const } : s.mode === 'auto' ? { t: 'Authorized under delegated policy', tone: 'green' as const } : { t: 'Within policy, needs your approval', tone: 'amber' as const };
  const priceMoved = Math.abs(live - p.premium) > 0.005;
  return (
    <div className="col gap16">
      <Card className="glow-gold">
        <div className="row between start wrap gap12">
          <div><div className="row gap8"><Sparkle /><span className="small muted">{p.origin === 'agent' ? 'Agent proposal' : 'From assistant'} · {p.id} · {fmtStamp(p.createdAt)}</span></div><h2 className="display" style={{ fontSize: 22, marginTop: 6 }}>{p.headline}</h2></div>
          <Badge tone={sc.t}>{sc.l}</Badge>
        </div>
        <div className="stat-grid mt16">
          <div><div className="tiny muted">Entry premium</div><div className="big bold num">{usd(live)}</div>{priceMoved && <div className="tiny amber">Was {usd(p.premium)}</div>}</div>
          <div><div className="tiny muted">Quantity</div><div className="big bold">{p.qty}</div></div>
          <div><div className="tiny muted"><Term k="expiry">Expiry</Term></div><div className="big bold">{fmtDate(p.expiry)}</div></div>
          <div><div className="tiny muted"><Term k="collateral">Collateral</Term></div><div className="big bold">{usd0(total)}</div></div>
          <div><div className="tiny muted">Max loss</div><div className="big bold red">{usd0(total)}</div></div>
          <div><div className="tiny muted">Expected payoff</div><div className="big bold green">{p.side === 'call' ? `Above ${usd(breakeven(p.side, p.strike, live))}` : `Below ${usd(breakeven(p.side, p.strike, live))}`}</div></div>
        </div>
        <div className="row gap8 wrap mt16"><QualityBadge q={p.quality} /><span className="small muted">Confidence {Math.round(p.confidence * 100)}%</span><div className="grow" style={{ maxWidth: 140, height: 5, background: '#24242b', borderRadius: 5 }}><div style={{ width: `${p.confidence * 100}%`, height: 5, background: 'var(--gold)', borderRadius: 5 }} /></div></div>
        {p.decisionNote && <p className="small muted mt12">{p.decisionNote}</p>}
      </Card>

      <div className="grid g2">
        <Card>
          <CardHead title="Independent checks" right={<CheckVerdict checks={checks} />} sub="Re-run live against your policy" />
          <SegBars checks={checks} lg />
          <div className="mt8"><ChecksList checks={checks} /></div>
          <div className="row gap8 mt12"><LuLock size={14} className="muted" /><span className="small muted">Policy authorization:</span><Badge tone={policyStatus.tone} sm>{policyStatus.t}</Badge></div>
        </Card>
        <Card><CardHead title="Payoff at expiry" sub={`${a.sym} now ${usd(a.price)}`} /><PayoffChart side={p.side} strike={p.strike} premium={live} spot={a.price} qty={p.qty} height={200} /></Card>
      </div>

      <Card>
        <Tabs value={section as 'reasoning'} onChange={setSection} tabs={[{ v: 'reasoning', label: 'AI reasoning' }, { v: 'evidence', label: 'Evidence', n: p.evidence.length }, { v: 'risks', label: 'Risks', n: p.risks.length }, { v: 'alts', label: 'Alternatives', n: p.alternatives.length }]} />
        <div className="mt16">
          {section === 'reasoning' && <div className="col gap8"><ul className="col gap8 text2" style={{ paddingLeft: 18, listStyle: 'disc' }}>{p.reasoning.map((r) => <li key={r}>{r}</li>)}</ul><div className="banner info"><div><b>Uncertainty.</b> {p.uncertainty}</div></div></div>}
          {section === 'evidence' && <EvidenceList items={p.evidence} />}
          {section === 'risks' && <ul className="col gap8 text2" style={{ paddingLeft: 18, listStyle: 'disc' }}>{p.risks.map((r) => <li key={r}>{r}</li>)}</ul>}
          {section === 'alts' && <div className="col gap12">{p.alternatives.map((x) => <div key={x.title} className="card" style={{ padding: 14 }}><div className="semi">{x.title}</div><div className="small text2">{x.detail}</div><div className="small muted mt4">Trade-off: {x.tradeoff}</div></div>)}</div>}
        </div>
      </Card>

      {!decided && (
        <Card>
          {s.mode === 'advisory' && <Banner tone="info">Advisory mode: this is a recommendation. Open it in the Trade Builder to act on it yourself.</Banner>}
          {verdict === 'fail' && <Banner tone="danger"><b>The policy engine would block this.</b> {checks.find((c) => c.status === 'fail')?.detail} You can still reject it, or change the limit in Agent settings.</Banner>}
          <div className="row gap8 wrap mt12">
            <Button variant="gold" size="lg" disabled={verdict === 'fail' || s.mode === 'advisory'} onClick={onApprove}>Approve and sign</Button>
            <Button variant="danger" onClick={onReject}>Reject</Button>
            <Button onClick={() => go(`/app/trade?c=${p.contractId}`)}>Open in Trade Builder</Button>
            <Button variant="ghost" onClick={() => go(`/app/markets/${p.sym}`)}>View full analysis</Button>
          </div>
          <p className="tiny faint mt12">Approving asks your wallet to sign, then runs pricing, collateral and policy checks again before submission.</p>
        </Card>
      )}
      {decided && p.txHash && <Card><CardHead title="Result" right={<TradeStatus stage={p.status === 'executed' ? 'confirmed' : 'submitted'} />} /><KV k="Transaction" v={<span className="mono tiny">{p.txHash.slice(0, 10)}…</span>} /><button className="link small mt8" onClick={() => go('/app/activity')}>Open in journal</button></Card>}
    </div>
  );
}
