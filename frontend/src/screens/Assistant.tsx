import { useEffect, useRef, useState } from 'react';
import { LuSend, LuMessageSquareText } from 'react-icons/lu';
import { SUGGESTIONS } from '../lib/assistant';
import { AreaChart } from '../components/charts';
import { EvidenceList } from '../components/status';
import { Badge, Button, Card, CardHead, Growth, PageHead, Sparkle, Term } from '../components/ui';
import { assetBySym, fmtDate, GLOSSARY, makeContract } from '../data/mock';
import type { Block } from '../data/types';
import { go } from '../router';
import { createProposalFromDraft, sendChat, useStore } from '../state/store';
import { CONTRACT_SIZE, usd, usd0, breakeven } from '../lib/pricing';
import { TestnetProposalComposer } from '../components/TestnetProposalComposer';

function BlockView({ b }: { b: Block }) {
  const s = useStore();
  switch (b.t) {
    case 'p': return <div className="bubble">{b.text}</div>;
    case 'list': return <div className="bubble"><ul style={{ paddingLeft: 18, listStyle: 'disc' }} className="col gap4">{b.items.map((i) => <li key={i}>{i}</li>)}</ul></div>;
    case 'term': { const g = GLOSSARY[b.k]; return <div className="struct"><div className="semi gold">{g.title}</div><div className="text2 mt4">{g.body}</div></div>; }
    case 'evidence': return <div className="struct"><EvidenceList items={b.items} /></div>;
    case 'analysis': {
      const a = assetBySym(b.sym)!;
      return (
        <div className="struct gold">
          <div className="row between"><b>{a.name} <span className="muted">{a.sym}</span></b><Growth v={(a.price / a.prevClose - 1) * 100} /></div>
          <div className="big bold mt4">{usd(a.price)} <span className="tiny faint">demo feed</span></div>
          <AreaChart data={a.series.slice(-45)} height={90} dotted={false} fmt={(v) => usd(v)} />
          <div className="row gap8 wrap mt8"><Badge sm>IV {(a.iv * 100).toFixed(0)}%</Badge><Badge sm>IV rank {a.ivRank}</Badge><Badge sm tone={a.signal === 'opportunity' ? 'gold' : 'outline'}>{a.signal === 'opportunity' ? 'Setup' : a.signal === 'no-trade' ? 'No trade' : a.signal === 'watch' ? 'Watching' : 'Analysis only'}</Badge></div>
          <div className="row gap8 mt12"><Button size="sm" onClick={() => go(`/app/markets/${a.sym}`)}>Full analysis</Button>{a.optionsSupported && <Button size="sm" onClick={() => go(`/app/markets/${a.sym}/chain`)}>Options chain</Button>}</div>
        </div>
      );
    }
    case 'notrade':
      return (
        <div className="struct" style={{ borderStyle: 'dashed' }}>
          <div className="row gap8"><Badge tone="outline">No trade</Badge><b>{b.sym}</b></div>
          <p className="small muted mt8">Not trading is a valid answer. Reasons:</p>
          <ul className="small text2 col gap4 mt4" style={{ paddingLeft: 18, listStyle: 'disc' }}>{b.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
        </div>
      );
    case 'compare':
      return (
        <div className="struct"><table className="tbl"><thead><tr><th>{b.sym} call</th><th className="r">{b.aTitle}</th><th className="r">{b.bTitle}</th></tr></thead><tbody>{b.rows.map((r) => <tr key={r.label}><td className="muted">{r.label}</td><td className="r num">{r.a}</td><td className="r num">{r.b}</td></tr>)}</tbody></table></div>
      );
    case 'proposal': {
      const d = b.draft;
      const c = makeContract(d.sym, d.expiry, d.side, d.strike, s.demo.feed);
      const ask = c.ask;
      const already = s.proposals.some((p) => p.contractId === c.id && p.origin === 'assistant' && p.status === 'pending');
      return (
        <div className="struct gold">
          <div className="row between"><div className="row gap8"><Sparkle /><b>Proposal</b></div><Badge tone={c.quality === 'verified' ? 'green' : c.quality === 'estimated' ? 'amber' : 'outline'} sm>{c.quality === 'verified' ? 'Verified price' : c.quality === 'estimated' ? 'Estimated price' : 'No price'}</Badge></div>
          <div className="big bold mt8">{d.headline}</div>
          <ul className="small text2 col gap4 mt8" style={{ paddingLeft: 18, listStyle: 'disc' }}>{d.thesis.map((t) => <li key={t}>{t}</li>)}</ul>
          {ask != null ? (
            <div className="grid g2 g-stay2 mt12" style={{ gap: 8 }}>
              <div><div className="tiny muted">Cost</div><b>{usd0(ask * CONTRACT_SIZE * d.qty)}</b></div>
              <div><div className="tiny muted">Max loss</div><b className="red">{usd0(ask * CONTRACT_SIZE * d.qty)}</b></div>
              <div><div className="tiny muted">Break-even</div><b>{usd(breakeven(d.side, d.strike, ask))}</b></div>
              <div><div className="tiny muted">Expiry</div><b>{fmtDate(d.expiry)}</b></div>
            </div>
          ) : <p className="small muted mt12">No pricing evidence, so no cost can be shown.</p>}
          <div className="small muted mt12"><Term k="iv">Risks</Term>: the premium is lost if the price doesn’t finish {d.side === 'call' ? 'above' : 'below'} the strike. Pricing is demo data.</div>
          <div className="row gap8 wrap mt12">
            <Button size="sm" variant="gold" disabled={ask == null || already} onClick={() => { const id = createProposalFromDraft(d); go(`/app/proposals?id=${id}`); }}>{already ? 'Already sent' : 'Send to Approval Centre'}</Button>
            <Button size="sm" onClick={() => go(`/app/trade?c=${c.id}`)}>Open in Trade Builder</Button>
          </div>
        </div>
      );
    }
  }
}

export default function Assistant() {
  const s = useStore();
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [s.chat.length, s.chatBusy]);
  const send = (t: string) => { sendChat(t); setText(''); };
  return (
    <div className="page">
      <PageHead title="AI assistant" sub="One Assistant for analysis and trade requests. The Agent tab only configures this same agent; current market examples are demo data and Testnet proposals require a principal wallet signature and separate holder payment." />
      <div className="chat-wrap">
        <Card className="chat">
          <div className="chat-scroll" aria-live="polite">
            {s.chat.map((m) => (
              <div key={m.id} className={`msg ${m.role}`}>
                {m.role === 'ai' && <div className="row gap8"><span className="ai-av"><LuMessageSquareText size={14} /></span><span className="tiny faint">Handel AI</span></div>}
                {m.blocks.map((b, i) => (m.role === 'user' && b.t === 'p' ? <div key={i} className="bubble">{b.text}</div> : <BlockView key={i} b={b} />))}
              </div>
            ))}
            {s.chatBusy && <div className="msg ai"><div className="bubble typing" aria-label="Assistant is typing"><i /><i /><i /></div></div>}
            <div ref={end} />
          </div>
          <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send(text); }}>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask about NVDA, an option, or your risk…" aria-label="Message" />
            <Button type="submit" variant="gold" icon={<LuSend size={15} />} disabled={!text.trim() || s.chatBusy}>Send</Button>
          </form>
        </Card>
        <div className="col gap16">
          <TestnetProposalComposer />
          <Card>
            <CardHead title="Try asking" />
            <div className="col gap8">{SUGGESTIONS.map((q) => <button key={q} className="chip" style={{ justifyContent: 'flex-start', textAlign: 'left', borderRadius: 14 }} disabled={s.chatBusy} onClick={() => send(q)}>{q}</button>)}</div>
          </Card>
          <Card><CardHead title="How it behaves" /><ul className="small muted col gap4" style={{ paddingLeft: 16, listStyle: 'disc' }}><li>It can recommend a trade or say no trade.</li><li>Proposals go to the Approval Centre. Nothing executes from chat.</li><li>When market data is down it says so instead of guessing.</li></ul></Card>
        </div>
      </div>
    </div>
  );
}
