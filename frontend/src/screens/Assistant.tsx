import { useEffect, useRef, useState } from 'react';
import { LuSend, LuMessageSquareText } from 'react-icons/lu';
import { SUGGESTIONS } from '../lib/assistant';
import { Button, Card, CardHead, PageHead } from '../components/ui';
import type { Block } from '../data/types';
import { sendChat, useStore } from '../state/store';

function BlockView({ b }: { b: Block }) {
  if (b.t === 'p') return <div className="bubble">{b.text}</div>;
  if (b.t === 'list') return <div className="bubble"><ul style={{ paddingLeft: 18, listStyle: 'disc' }} className="col gap4">{b.items.map((item) => <li key={item}>{item}</li>)}</ul></div>;
  return null;
}

export default function Assistant() {
  const s = useStore();
  const [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [s.chat.length, s.chatBusy]);
  const send = (value: string) => { sendChat(value); setText(''); };
  return (
    <div className="page">
      <PageHead title="AI assistant" sub="Ask questions or describe an explicit writer-side NEAR Testnet wNEAR Call/Put. Handel checks the on-chain policy; the principal signs collateral and the holder separately signs premium." />
      <div className="chat-wrap">
        <Card className="chat">
          <div className="chat-scroll" aria-live="polite">
            {s.chat.map((message) => (
              <div key={message.id} className={`msg ${message.role}`}>
                {message.role === 'ai' && <div className="row gap8"><span className="ai-av"><LuMessageSquareText size={14} /></span><span className="tiny faint">Handel AI</span></div>}
                {message.blocks.map((block, i) => (message.role === 'user' && block.t === 'p' ? <div key={i} className="bubble">{block.text}</div> : <BlockView key={i} b={block} />))}
              </div>
            ))}
            {s.chatBusy && <div className="msg ai"><div className="bubble typing" aria-label="Assistant is typing"><i /><i /><i /></div></div>}
            <div ref={end} />
          </div>
          <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send(text); }}>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask a question or describe a Testnet Call or Put…" aria-label="Message" />
            <Button type="submit" variant="gold" icon={<LuSend size={15} />} disabled={!text.trim() || s.chatBusy}>Send</Button>
          </form>
        </Card>
        <div className="col gap16">
          <Card>
            <CardHead title="Try asking" />
            <div className="col gap8">{SUGGESTIONS.map((question) => <button key={question} className="chip" style={{ justifyContent: 'flex-start', textAlign: 'left', borderRadius: 14 }} disabled={s.chatBusy} onClick={() => send(question)}>{question}</button>)}</div>
          </Card>
          <Card>
            <CardHead title="Execution boundaries" />
            <ul className="small muted col gap4" style={{ paddingLeft: 16, listStyle: 'disc' }}>
              <li>Only explicit, complete writer-side wNEAR Call/Put requests are eligible for the connected Testnet execution path.</li>
              <li>The restricted FunctionCall key cannot transfer tokens. It can only call the four allowlisted OptionsContract methods.</li>
              <li>The principal signs collateral and the holder separately signs premium.</li>
              <li>The premium is a fixed Testnet fixture, not a live market quote. Live market prices and option chains are not connected.</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
