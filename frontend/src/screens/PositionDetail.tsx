import { useState } from 'react';
import { LuCheck } from 'react-icons/lu';
import { PayoffChart } from '../components/charts';
import { SignModal } from '../components/SignModal';
import { TradeStatus, TxLanes } from '../components/status';
import { Badge, Banner, Button, Card, CardHead, EmptyState, KV, Modal, PageHead, QualityBadge, Sparkle, Term, useTick } from '../components/ui';
import { assetBySym, DEMO_NOW, dteOf, fmtDate, fmtStamp } from '../data/mock';
import { shortHash } from '../data/seed';
import { go } from '../router';
import { nowMs, recordEscrowAction, useStore } from '../state/store';
import { exerciseEscrowPosition, releaseExpiredEscrowPosition } from '../lib/near-wallet';
import { markPosition } from '../lib/valuation';
import { CONTRACT_SIZE, breakeven, signedUsd, usd, usd0 } from '../lib/pricing';

type Act = 'exercise' | 'release' | 'close';
const COPY: Record<Act, { title: string; what: string[]; cta: string }> = {
  exercise: { title: 'Exercise this option', cta: 'Exercise', what: ['You use your right to settle at the strike price.', 'Only worthwhile when the option is in the money.', 'Collateral is released and your realized P&L is settled after confirmation.'] },
  release: { title: 'Request expiry release', cta: 'Request release', what: ['The option has expired. A release finalises the position.', 'Any collateral still locked to it is freed after confirmation.', 'If it expired out of the money, the premium is a realized loss.'] },
  close: { title: 'Close position', cta: 'Close position', what: ['You sell the option back at the current estimated price.', 'You keep any remaining time value instead of waiting for expiry.', 'The final price may differ slightly from the estimate shown.'] },
};

export default function PositionDetail({ id }: { id: string }) {
  const s = useStore();
  useTick(1000);
  const p = s.positions.find((x) => x.id === id);
  const [act, setAct] = useState<Act | null>(null);
  const [sign, setSign] = useState(false);
  if (!p) return <div className="page"><EmptyState title="Position not found" body="It may have been removed by the demo reset." action={<Button onClick={() => go('/app/portfolio')}>Back to Portfolio</Button>} /></div>;
  const a = assetBySym(p.sym)!;
  const m = markPosition(p, s.demo.feed);
  const dte = dteOf(p.expiry);
  const expiryMs = Date.parse(p.expiry + 'T23:59:59Z');
  const exerciseDeadlineMs = expiryMs + 24 * 60 * 60 * 1000;
  const expired = p.status === 'expired' || (nowMs() >= expiryMs && p.status === 'open');
  const inExerciseWindow = nowMs() >= expiryMs && nowMs() <= exerciseDeadlineMs;
  const cost = p.entryPremium * CONTRACT_SIZE * p.qty;
  const txs = p.txHashes.map((h) => s.txs[h]).filter(Boolean);
  const live = txs.find((t) => ['submitted', 'pending', 'unknown', 'failed'].includes(t.stage) && (t.stage !== 'failed' || p.status === 'failed'));
  const busy = !!p.pendingOp || p.status === 'pending';
  const remain = Math.max(Date.parse(p.expiry + 'T21:00:00Z') - nowMs(), 0);
  const d = Math.floor(remain / 86400000), h = Math.floor(remain / 3600000) % 24, mi = Math.floor(remain / 60000) % 60;

  const lifecycle = ['Opened', 'Active', 'Expiry', 'Closed'];
  const li = p.status === 'closed' ? 3 : expired ? 2 : p.status === 'open' ? 1 : 0;

  const can = {
    exercise: p.status === 'open' && !!p.chainPositionId && !!p.escrowPositionId && m.itm && !busy && inExerciseWindow,
    close: false,
    release: p.status === 'open' && !!p.chainPositionId && !!p.escrowPositionId && nowMs() > exerciseDeadlineMs && !busy,
  };
  const why = (k: Act) => {
    if (busy) return 'Another action is pending.';
    if (p.status !== 'open' && p.status !== 'expired') return 'Only confirmed positions can be managed.';
    if (k === 'exercise') return !p.chainPositionId ? 'This is a demo-only position without an on-chain escrow ID.' : !m.itm ? 'Out of the money. Exercising would lose value.' : !inExerciseWindow ? nowMs() < expiryMs ? 'Exercise is available at maturity, not before expiry.' : 'The 24-hour exercise window has ended. Request expiry release.' : '';
    if (k === 'close') return 'Early close is not implemented by the Testnet escrow contract yet.';
    return !p.chainPositionId ? 'This position has no on-chain escrow record.' : nowMs() <= exerciseDeadlineMs ? 'Available after the 24-hour exercise grace period.' : '';
  };
  const checks = act === 'exercise' ? [['Position confirmed', p.status === 'open'], ['In the money', m.itm], ['Maturity and exercise window', inExerciseWindow], ['On-chain escrow IDs available', !!p.escrowPositionId], ['No pending action', !busy]] : act === 'release' ? [['Position expired', nowMs() > exerciseDeadlineMs], ['On-chain escrow IDs available', !!p.escrowPositionId], ['No pending action', !busy]] : [['Position confirmed', p.status === 'open'], ['Pricing evidence available', m.valued], ['No pending action', !busy]];

  return (
    <div className="page">
      <PageHead crumbs={[{ label: 'Portfolio', href: '/app/portfolio' }, { label: p.id }]} title={<span>{p.sym} {p.strike} {p.side === 'call' ? 'Call' : 'Put'}</span>} sub={`Expires ${fmtDate(p.expiry)} · ${p.qty} contract${p.qty > 1 ? 's' : ''} · opened ${fmtDate(p.openedAt)}`}
        actions={<>{p.status === 'open' || p.status === 'expired' ? <Badge tone={expired ? 'amber' : 'green'}>{expired ? 'Expired' : 'Open'}</Badge> : p.status === 'pending' ? <TradeStatus stage="pending" /> : p.status === 'unresolved' ? <TradeStatus stage="unknown" /> : p.status === 'failed' ? <TradeStatus stage="failed" /> : <Badge tone="outline">Closed · {p.closeReason}</Badge>}</>} />

      {p.status === 'unresolved' && <Banner tone="warn"><b>This position is unresolved.</b> The transaction was submitted but Handel found no execution receipt. It is not counted as open, no P&L is shown, and its collateral stays reserved. Use “Check again” below.</Banner>}
      {p.status === 'failed' && <Banner tone="danger"><b>The transaction failed.</b> No funds moved and no position exists. You can build the trade again.</Banner>}
      {p.status === 'pending' && <Banner tone="info"><b>Waiting for confirmation.</b> Submitted is not the same as completed. Management actions unlock once the network confirms.</Banner>}
      {expired && p.status !== 'closed' && <Banner tone="warn"><b>This option has reached maturity.</b> {inExerciseWindow ? 'The 24-hour exercise submission window is open.' : 'The exercise window has ended; collateral release is available after the grace period.'} {m.itm ? 'The demo valuation is in the money.' : 'The demo valuation is out of the money.'}</Banner>}
      {(!p.chainPositionId || !p.escrowPositionId) && <Banner tone="info">This is a legacy demo position. It has no on-chain OptionsContract/escrow IDs, so wallet settlement actions are disabled.</Banner>}
      {dte > 0 && dte <= 3 && p.status === 'open' && <Banner tone="warn"><b>Expires in {dte} day{dte > 1 ? 's' : ''}.</b> Time decay is now the main driver of value. {m.itm ? 'Consider closing or exercising.' : 'It is out of the money, so it may expire worthless.'}</Banner>}

      <div className="grid g-side">
        <div className="col gap16">
          <Card>
            <div className="lifecycle" aria-label="Lifecycle" style={{ marginBottom: 18 }}>
              {lifecycle.map((l, i) => <span key={l} className="row gap8">{i > 0 && <span className="sep" />}<span className={`st ${i < li ? 'done' : i === li ? 'on' : ''}`}><span className="n">{i < li ? <LuCheck size={11} /> : i + 1}</span>{l}</span></span>)}
            </div>
            <div className="grid g3 g-stay2">
              <div><div className="small muted"><Term k="mark">Current mark</Term></div><div className="hero-num" style={{ fontSize: 28 }}>{m.mark != null ? usd(m.mark) : '—'}</div><QualityBadge q={m.quality} /></div>
              <div><div className="small muted">{p.status === 'closed' ? 'Realized P&L' : 'Unrealized P&L'}</div><div className={`hero-num ${m.pnl >= 0 ? 'green' : 'red'}`} style={{ fontSize: 28 }}>{m.valued ? signedUsd(m.pnl, 0) : '—'}</div>{m.valued && <div className="tiny muted">{m.pnlPct >= 0 ? '+' : ''}{m.pnlPct.toFixed(1)}%</div>}</div>
              <div><div className="small muted">Time to expiry</div>{p.status === 'closed' ? <div className="hero-num" style={{ fontSize: 28 }}>—</div> : <div className="countdown" style={{ marginTop: 4 }}><div><b>{d}</b><span>days</span></div><div><b>{h}</b><span>hrs</span></div><div><b>{mi}</b><span>min</span></div></div>}</div>
            </div>
            {!m.valued && p.status !== 'closed' && <p className="small muted mt12">No valuation: {p.status === 'open' ? 'pricing evidence is unavailable right now.' : 'the position is not confirmed.'}</p>}
          </Card>
          {m.valued && p.status !== 'closed' && <Card><CardHead title="Payoff at expiry" sub={`Break-even ${usd(breakeven(p.side, p.strike, p.entryPremium))} · max loss ${usd0(cost)}`} /><PayoffChart side={p.side} strike={p.strike} premium={p.entryPremium} spot={a.price} qty={p.qty} /></Card>}
          {live && <Card><CardHead title="Transaction in progress" right={<TradeStatus stage={live.stage} />} sub={live.title} /><TxLanes tx={live} /></Card>}
          <Card>
            <CardHead title="Transaction history" />
            {txs.length === 0 ? <p className="muted small">No transactions recorded.</p> : txs.map((t) => (
              <div key={t.hash} className="kv"><span className="k"><TradeStatus stage={t.stage} sm /><span className="text2">{t.title}</span></span><span className="v mono tiny">{shortHash(t.hash)} · {fmtStamp(t.updatedAt)}</span></div>
            ))}
            <button className="link small mt12" onClick={() => go('/app/activity')}>Open the full journal</button>
          </Card>
        </div>
        <div className="col gap16">
          <Card>
            <CardHead title="Manage" sub="Every action is reviewed before you sign." />
            <div className="col gap8">
              {(['close', 'exercise', 'release'] as Act[]).map((k) => (
                <div key={k}>
                  <Button block variant={k === 'release' && can.release ? 'gold' : 'soft'} disabled={!can[k]} onClick={() => setAct(k)}>{COPY[k].cta}</Button>
                  {!can[k] && <div className="tiny faint mt4">{why(k)}</div>}
                </div>
              ))}
            </div>
            <button className="link small mt16" onClick={() => go('/app/assistant')}><Sparkle size={12} /> Ask the AI about this position</button>
          </Card>
          <Card>
            <CardHead title="Position details" />
            <KV k="Original trade" v={`${p.qty} × ${p.strike} ${p.side}`} /><KV k={<Term k="premium">Entry premium</Term>} v={usd(p.entryPremium)} /><KV k="Total paid" v={usd0(cost)} />
            <KV k={<Term k="collateral">Collateral reserved</Term>} v={p.status === 'closed' || p.status === 'failed' ? '$0' : usd0(cost)} /><KV k="Maximum loss" v={usd0(cost)} />
            <KV k="Underlying now" v={usd(a.price)} /><KV k="Status vs strike" v={<Badge sm tone={m.itm ? 'green' : 'outline'}>{m.itm ? 'In the money' : 'Out of the money'}</Badge>} />
            <KV k="Opened by" v={p.source === 'manual' ? 'You' : p.source === 'ai-approved' ? 'AI proposal you approved' : 'Agent, automatically'} />
            {p.proposalId && <KV k="Proposal" v={<button className="link" onClick={() => go(`/app/proposals?id=${p.proposalId}`)}>{p.proposalId}</button>} />}
          </Card>
        </div>
      </div>

      <Modal open={!!act && !sign} onClose={() => setAct(null)} title={act ? COPY[act].title : ''}>
        {act && (
          <div className="col gap16">
            <div><div className="semi">What happens</div><ul className="col gap4 small text2 mt4" style={{ paddingLeft: 18, listStyle: 'disc' }}>{COPY[act].what.map((w) => <li key={w}>{w}</li>)}</ul></div>
            <div className="card" style={{ padding: 12 }}>
              <KV k="Position" v={`${p.sym} ${p.strike} ${p.side} ×${p.qty}`} />
              <KV k={act === 'close' ? 'Estimated proceeds' : 'Intrinsic value'} v={usd0((act === 'close' ? (m.mark ?? 0) : m.intrinsic) * CONTRACT_SIZE * p.qty)} />
              <KV k="Estimated P&L" v={<span className={((act === 'close' ? m.pnl : (m.intrinsic * CONTRACT_SIZE * p.qty - cost)) >= 0) ? 'green' : 'red'}>{signedUsd(act === 'close' ? m.pnl : m.intrinsic * CONTRACT_SIZE * p.qty - cost, 0)}</span>} />
            </div>
            <div>{checks.map(([l, ok]) => <div key={String(l)} className={`check ${ok ? 'pass' : 'fail'}`}><span className="ic">{ok ? <LuCheck size={13} /> : '×'}</span><span className="semi">{l as string}</span></div>)}</div>
            <div className="small muted">After you sign, the request is submitted and tracked. The position changes only when settlement is confirmed.</div>
            <div className="row gap8"><Button block onClick={() => setAct(null)}>Cancel</Button><Button block variant="gold" disabled={checks.some(([, ok]) => !ok)} onClick={() => setSign(true)}>Continue to wallet</Button></div>
          </div>
        )}
      </Modal>
      <SignModal open={sign} onClose={() => setSign(false)} execute={() => {
        if (!p.chainPositionId || !p.escrowPositionId) return Promise.reject(new Error('This position has no on-chain escrow IDs.'));
        if (act === 'exercise') return exerciseEscrowPosition(p.chainPositionId, p.escrowPositionId);
        if (act === 'release') return releaseExpiredEscrowPosition(p.chainPositionId, p.escrowPositionId);
        return Promise.reject(new Error('Early close is not implemented by the Testnet escrow contract.'));
      }} onSigned={async (result) => { if (act === 'exercise' || act === 'release') recordEscrowAction(p.id, act, result); setSign(false); setAct(null); }} action={act ? COPY[act].title : ''} rows={[{ k: 'Position', v: `${p.sym} ${p.strike} ${p.side} ×${p.qty}` }, { k: 'On-chain ID', v: p.chainPositionId ?? 'Not available' }]} />
    </div>
  );
}
void DEMO_NOW;
