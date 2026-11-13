import { useEffect, useState } from 'react';
import { LuBan, LuScanSearch, LuCircleCheck, LuCircleHelp, LuCircleX, LuClock, LuKey, LuLayers, LuSend, LuThumbsDown, LuThumbsUp, LuTimer, LuX } from 'react-icons/lu';
import { ChecksList, EvidenceList, TradeStatus, TxLanes } from '../components/status';
import { Badge, Banner, Button, Card, CardHead, EmptyState, KV, Modal, PageHead, PageSkeleton, SymBadge, Tabs, useLoading } from '../components/ui';
import { fmtStamp } from '../data/mock';
import { shortHash } from '../data/seed';
import type { ActKind, Activity as Act } from '../data/types';
import { go } from '../router';
import { useStore } from '../state/store';

const ICON: Record<ActKind, { i: typeof LuScanSearch; c: string }> = {
  proposal: { i: LuScanSearch, c: 'ai' }, approval: { i: LuThumbsUp, c: 'ok' }, rejection: { i: LuThumbsDown, c: '' }, ai_decision: { i: LuScanSearch, c: 'ai' }, no_trade: { i: LuBan, c: '' },
  tx_submitted: { i: LuSend, c: '' }, tx_confirmed: { i: LuCircleCheck, c: 'ok' }, tx_failed: { i: LuCircleX, c: 'bad' }, tx_unknown: { i: LuCircleHelp, c: 'warn' },
  lifecycle: { i: LuTimer, c: '' }, exercise_request: { i: LuLayers, c: '' }, release_request: { i: LuClock, c: '' }, permission_change: { i: LuKey, c: '' },
};
type F = 'all' | 'ai' | 'tx' | 'positions' | 'permissions';
const FILTER: Record<F, (a: Act) => boolean> = {
  all: () => true,
  ai: (a) => ['proposal', 'approval', 'rejection', 'ai_decision', 'no_trade'].includes(a.kind),
  tx: (a) => ['tx_submitted', 'tx_confirmed', 'tx_failed', 'tx_unknown'].includes(a.kind),
  positions: (a) => ['lifecycle', 'exercise_request', 'release_request'].includes(a.kind),
  permissions: (a) => a.kind === 'permission_change',
};

export default function Activity({ id }: { id?: string }) {
  const s = useStore();
  const [f, setF] = useState<F>('all');
  const [sel, setSel] = useState<string | null>(id ?? null);
  const loading = useLoading(300);
  useEffect(() => { setSel(id ?? null); }, [id]);
  if (loading) return <PageSkeleton />;
  const list = s.activity.filter(FILTER[f]);
  const item = s.activity.find((a) => a.id === sel) ?? null;
  const counts = (k: F) => s.activity.filter(FILTER[k]).length;
  return (
    <div className="page">
      <PageHead title="Activity and decision journal" sub="Browser-session activity only. Persistent on-chain transaction and position indexing is not connected yet." />
      <Tabs value={f} onChange={setF} tabs={[{ v: 'all', label: 'All', n: counts('all') }, { v: 'ai', label: 'AI decisions', n: counts('ai') }, { v: 'tx', label: 'Transactions', n: counts('tx') }, { v: 'positions', label: 'Positions', n: counts('positions') }, { v: 'permissions', label: 'Permissions', n: counts('permissions') }]} />
      <Card className="flush">
        {list.length === 0 ? <EmptyState title="Nothing recorded yet" body="This journal only contains events recorded in the current browser session. Reloading clears this local history." action={<Button variant="gold" onClick={() => go('/app/assistant')}>Open Assistant</Button>} /> : (
          <div style={{ padding: '4px 18px' }}>
            {list.map((a) => {
              const I = ICON[a.kind].i;
              return (
                <button key={a.id} className={`tl-item ${sel === a.id ? 'on' : ''}`} onClick={() => setSel(a.id)}>
                  <span className={`tl-ic ${ICON[a.kind].c}`}><I size={16} /></span>
                  <div className="grow"><div className="row gap8 wrap"><span className="semi">{a.title}</span>{a.stage && <TradeStatus stage={a.stage} sm />}</div><div className="small muted">{a.summary}</div><div className="tiny faint mt4">{fmtStamp(a.ts)} · {a.actor === 'ai' ? 'AI' : a.actor === 'user' ? 'You' : 'System'} · {a.id}</div></div>
                </button>
              );
            })}
          </div>
        )}
      </Card>
      <Modal open={!!item} onClose={() => { setSel(null); if (id) go('/app/activity'); }} title={item?.title ?? ''} wide>
        {item && <Detail a={item} />}
      </Modal>
    </div>
  );
}

function Detail({ a }: { a: Act }) {
  const s = useStore();
  const r = a.record;
  const tx = a.txHash ? s.txs[a.txHash] : undefined;
  return (
    <div className="col gap16">
      <div className="row gap8 wrap">{a.stage && <TradeStatus stage={a.stage} />}<Badge tone="outline">{a.actor === 'ai' ? 'By the AI' : a.actor === 'user' ? 'By you' : 'By the system'}</Badge><span className="small muted">{fmtStamp(a.ts)}</span>{a.sym && <Badge sm>{a.sym}</Badge>}</div>
      <p className="text2">{a.summary}</p>
      {a.kind === 'no_trade' && <Banner tone="info"><b>A no-trade decision is a valid result, not an error.</b> The AI looked and decided there was nothing worth doing.</Banner>}
      {a.stage === 'unknown' && <Banner tone="warn"><b>Unresolved.</b> The outcome could not be verified. It is not shown as a success or a failure.</Banner>}
      {tx && <div className="card" style={{ padding: 14 }}><TxLanes tx={tx} /></div>}
      {a.txHash && <div className="card" style={{ padding: 14 }}><KV k="Transaction" v={<a className="link mono tiny" href={`https://explorer.testnet.near.org/transactions/${a.txHash}`} target="_blank" rel="noreferrer">{shortHash(a.txHash)} · NEAR Explorer</a>} /></div>}
      {r ? (
        <>
          <div className="card" style={{ padding: '4px 14px' }}>
            <KV k="Action" v={r.action} /><KV k="Strategy" v={r.strategy} /><KV k="Confidence" v={r.confidence == null ? 'Not applicable' : `${Math.round(r.confidence * 100)}%`} /><KV k="User authorization" v={r.authorization} /><KV k="Execution result" v={r.result} />
            {a.txHash && <KV k="Transaction" v={<a className="link mono tiny" href={`https://explorer.testnet.near.org/transactions/${a.txHash}`} target="_blank" rel="noreferrer">{shortHash(a.txHash)} · NEAR Explorer</a>} />}
          </div>
          <div><div className="semi mb">Market evidence used</div><EvidenceList items={r.evidence} /></div>
          {r.checks.length > 0 && <div><div className="semi">Policy checks</div><ChecksList checks={r.checks} compact /></div>}
          <div className="grid g2">
            <div><div className="semi">Risks</div><ul className="small text2 col gap4 mt4" style={{ paddingLeft: 16, listStyle: 'disc' }}>{r.risks.map((x) => <li key={x}>{x}</li>)}</ul></div>
            <div><div className="semi">Alternatives considered</div><ul className="small text2 col gap4 mt4" style={{ paddingLeft: 16, listStyle: 'disc' }}>{r.alternatives.map((x) => <li key={x}>{x}</li>)}</ul></div>
          </div>
          <div className="small muted"><b className="text2">Uncertainty.</b> {r.uncertainty}</div>
        </>
      ) : <p className="small muted">This event has no AI decision record attached.</p>}
      <div className="row gap8 wrap">
        {a.proposalId && <Button size="sm" onClick={() => go(`/app/proposals?id=${a.proposalId}`)}>Open proposal</Button>}
        {a.positionId && <Button size="sm" onClick={() => go(`/app/portfolio/${a.positionId}`)}>Open position</Button>}
      </div>
      <span className="hide"><LuX /></span>
    </div>
  );
}
