import type { ReactNode } from 'react';
import { LuCheck, LuX, LuMinus, LuTriangleAlert, LuCircleCheck, LuCircleX, LuClock, LuCircleHelp, LuRefreshCw, LuLoader } from 'react-icons/lu';
import { fmtStamp } from '../data/mock';
import { shortHash } from '../data/seed';
import type { Check, Evidence, Lane, Tx, TradeStage } from '../data/types';
import { agentStatus, recheckTx, useStore } from '../state/store';
import { go } from '../router';
import { Badge, Button, QualityBadge, Sparkle, type Tone } from './ui';

// ── trade status ─────────────────────────────────────────────
const STAGES: Record<TradeStage, { label: string; tone: Tone; hint: string }> = {
  draft: { label: 'Draft', tone: 'outline', hint: 'Not submitted' },
  awaiting_approval: { label: 'Awaiting approval', tone: 'amber', hint: 'Needs your decision' },
  approved: { label: 'Approved', tone: 'blue', hint: 'Approved, not yet signed' },
  awaiting_signature: { label: 'Awaiting signature', tone: 'amber', hint: 'Waiting for your wallet' },
  submitted: { label: 'Submitted', tone: 'blue', hint: 'Sent to the network. Not a completed trade' },
  pending: { label: 'Pending', tone: 'blue', hint: 'Waiting for execution and settlement evidence' },
  confirmed: { label: 'Confirmed', tone: 'green', hint: 'Receipt and settlement verified' },
  failed: { label: 'Failed', tone: 'red', hint: 'Did not execute. No funds moved' },
  unknown: { label: 'Unresolved', tone: 'amber', hint: 'Outcome could not be verified' },
};
export function TradeStatus({ stage, sm }: { stage: TradeStage; sm?: boolean }) {
  const s = STAGES[stage];
  const live = stage === 'submitted' || stage === 'pending' || stage === 'awaiting_signature';
  return (
    <Badge tone={s.tone} sm={sm} title={s.hint}>
      {live ? <span className="dot pulse" style={{ width: 6, height: 6 }} /> : stage === 'unknown' ? <LuCircleHelp size={12} /> : null}
      {s.label}
    </Badge>
  );
}
export const stageLabel = (s: TradeStage) => STAGES[s].label;

// ── agent status ─────────────────────────────────────────────
export function AgentPill({ onClick }: { onClick?: () => void }) {
  const s = useStore();
  const st = agentStatus(s);
  return (
    <button className={`agent-pill ${st.key}`} onClick={onClick ?? (() => go('/app/agent'))} aria-label={`Agent status: ${st.label}. Open agent settings`}>
      {st.key === 'analysing' ? <Sparkle size={14} /> : <span className={`dot ${st.key === 'active' || st.key === 'executing' ? 'pulse' : ''}`} />}
      <span>{st.label}</span>
      <span className="sub">{st.sub}</span>
    </button>
  );
}

// ── transaction lanes: submission → execution → settlement ───
function lanesFor(tx: Tx): { t: string; state: Lane; s: string }[] {
  switch (tx.stage) {
    case 'submitted':
      return [
        { t: 'Submission', state: 'active', s: 'Sent. Waiting to be included.' },
        { t: 'Execution', state: 'idle', s: 'Not started' },
        { t: 'Settlement', state: 'idle', s: 'Not started' },
      ];
    case 'pending':
      return [
        { t: 'Submission', state: 'done', s: 'Included in a block' },
        { t: 'Execution', state: 'active', s: 'Waiting for receipts' },
        { t: 'Settlement', state: 'idle', s: 'Waiting for execution' },
      ];
    case 'confirmed':
      return [
        { t: 'Submission', state: 'done', s: 'Included in a block' },
        { t: 'Execution', state: 'done', s: 'Receipt verified' },
        { t: 'Settlement', state: 'done', s: 'Settlement confirmed' },
      ];
    case 'failed':
      return [
        { t: 'Submission', state: 'done', s: 'Included in a block' },
        { t: 'Execution', state: 'failed', s: 'Rejected by the network' },
        { t: 'Settlement', state: 'idle', s: 'Nothing to settle' },
      ];
    case 'unknown':
      return [
        { t: 'Submission', state: 'done', s: 'Sent to the network' },
        { t: 'Execution', state: 'unknown', s: 'No receipt found yet' },
        { t: 'Settlement', state: 'unknown', s: 'Cannot be confirmed' },
      ];
    default:
      return [
        { t: 'Submission', state: 'idle', s: 'Not sent' },
        { t: 'Execution', state: 'idle', s: 'Not started' },
        { t: 'Settlement', state: 'idle', s: 'Not started' },
      ];
  }
}
const LaneIcon = ({ s }: { s: Lane }) =>
  s === 'done' ? <LuCircleCheck size={15} /> : s === 'failed' ? <LuCircleX size={15} /> : s === 'unknown' ? <LuCircleHelp size={15} /> : s === 'active' ? <LuLoader size={15} /> : <LuClock size={15} />;

export function TxLanes({ tx, showActions = true }: { tx: Tx; showActions?: boolean }) {
  const lanes = lanesFor(tx);
  return (
    <div className="col gap12">
      <div className="lanes" role="list" aria-label="Transaction progress">
        {lanes.map((l) => (
          <div key={l.t} className={`lane ${l.state}`} role="listitem">
            <div className="bar">
              <i style={{ transform: l.state === 'idle' ? 'scaleX(0)' : undefined }} />
            </div>
            <div className="t">
              <LaneIcon s={l.state} />
              {l.t}
            </div>
            <div className="s">{l.s}</div>
          </div>
        ))}
      </div>
      <div className="row between wrap gap8">
        <div className="small muted">{tx.note}</div>
        <div className="row gap8">
          <span className="mono tiny faint" title="Mock transaction hash">{shortHash(tx.hash)}</span>
          {showActions && tx.stage === 'unknown' && (
            <Button size="sm" variant="gold" icon={<LuRefreshCw size={13} />} onClick={() => recheckTx(tx.hash)}>
              Check again
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── checks and evidence ──────────────────────────────────────
export function CheckIcon({ s }: { s: Check['status'] }) {
  return s === 'pass' ? <LuCheck size={13} /> : s === 'fail' ? <LuX size={13} /> : s === 'warn' ? <LuTriangleAlert size={12} /> : <LuMinus size={13} />;
}
export function ChecksList({ checks, compact }: { checks: Check[]; compact?: boolean }) {
  return (
    <div className="checks">
      {checks.map((c) => (
        <div key={c.id} className={`check ${c.status}`}>
          <span className="ic">
            <CheckIcon s={c.status} />
          </span>
          <div className="grow">
            <div className="row between gap8">
              <span className="semi">{c.label}</span>
              {!compact && <Badge sm tone="outline" title={c.owner === 'policy' ? 'Your agent policy' : 'Platform rule'}>{c.owner === 'policy' ? 'Your policy' : 'Platform'}</Badge>}
            </div>
            <div className="d">{c.detail}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
export function SegBars({ checks, lg }: { checks: Check[]; lg?: boolean }) {
  if (!checks.length) return <div className="segbars"><i className="skip" style={{ width: 80 }} /></div>;
  return (
    <div className={`segbars ${lg ? 'lg' : ''}`} role="img" aria-label={`${checks.filter((c) => c.status === 'pass').length} of ${checks.length} checks passed`}>
      {checks.map((c) => (
        <i key={c.id} className={c.status} title={`${c.label}: ${c.detail}`} />
      ))}
    </div>
  );
}
export function CheckVerdict({ checks }: { checks: Check[] }) {
  const f = checks.filter((c) => c.status === 'fail').length;
  const w = checks.filter((c) => c.status === 'warn').length;
  if (f) return <Badge tone="red">{f} check{f > 1 ? 's' : ''} failed</Badge>;
  if (w) return <Badge tone="amber">Passed with {w} warning{w > 1 ? 's' : ''}</Badge>;
  return <Badge tone="green">All checks passed</Badge>;
}

export function EvidenceList({ items }: { items: Evidence[] }) {
  return (
    <div>
      {items.map((e, i) => (
        <div key={i} className="evidence">
          <span className="text2">{e.label}</span>
          <span className="semi right num">{e.value}</span>
          <span className="src">
            <span>{e.source}</span>
            <span>·</span>
            <span>{fmtStamp(e.ts)}</span>
            <QualityBadge q={e.quality} />
          </span>
        </div>
      ))}
    </div>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <div className="row gap8 wrap">{children}</div>;
}
