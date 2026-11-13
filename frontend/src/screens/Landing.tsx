import { Fragment, type CSSProperties } from 'react';
import { LuArrowRight, LuArrowUpRight, LuScanSearch, LuGithub, LuCheck, LuEye, LuLayers, LuScale, LuGauge, LuWallet, LuZap } from 'react-icons/lu';
import { HeroArt } from '../components/HeroArt';
import { Brand } from '../components/Shell';
import { Bars, Lollipop, TickDonut } from '../components/charts';
import { Growth, MCard, MStat } from '../components/ui';
import { go } from '../router';

const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

function GridDeco() {
  const cells = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 9; c++) cells.push(<rect key={`${r}-${c}`} x={c * 22 + 1} y={r * 20 + 1} width="18" height="16" rx="2" fill="none" stroke="rgba(255,255,255,.16)" />);
  return (
    <svg className="lp-grid-deco" width="210" height="84" aria-hidden>
      {cells}
    </svg>
  );
}

export default function Landing() {
  return (
    <div className="lp">
      <div className="lp-frame">
        <div className="orbs" aria-hidden><i /><i /><i /></div>
        <div className="lp-top">
          <header className="lp-nav-l">
            <Brand />
            <nav className="links" aria-label="Sections">
              <a onClick={() => scrollTo('how')}>How it works</a>
              <a onClick={() => scrollTo('modes')}>Modes</a>
            </nav>
          </header>
          <div className="lp-copy">
            <h1 className="lp-h1" aria-label="Options trading with an AI you control">
              {'Options trading with an AI you control'.split(' ').map((w, i) => (
                <Fragment key={i}><span className="w" aria-hidden style={{ '--i': i } as CSSProperties}>{w}</span>{' '}</Fragment>
              ))}
            </h1>
            <p className="lp-sub">
              Handel reads the market, explains every option, and proposes trades with the evidence attached. You decide what the AI may do, and you can stop it at any time.
            </p>
            <div className="row gap12 wrap">
              <button className="btn btn-gold btn-lg" onClick={() => go('/connect')}>Connect wallet</button>
              <button className="btn btn-lg btn-ghost" onClick={() => scrollTo('how')}>How does it work?</button>
            </div>
            <GridDeco />
          </div>
          <div className="lp-art">
            <div className="lp-nav-r">
              <nav className="links" aria-label="More sections">
                <a onClick={() => scrollTo('safety')}>Safety</a>
                <a onClick={() => scrollTo('preview')}>Preview</a>
              </nav>
              <button className="btn btn-white" onClick={() => go('/connect')}>Launch app</button>
            </div>
            <HeroArt />
          </div>
        </div>

        <div className="lp-trust">
          <span className="lbl">Built for the NEAR ecosystem</span>
          {['NEAR Testnet', 'Options-first', 'On-chain policy'].map((w) => <span key={w} className="w">{w}</span>)}
        </div>

        <section className="lp-sec" id="how">
          <h2>From idea to position in four clear steps</h2>
          <p className="lead">Every step shows what is happening and who is in control. A submitted transaction is never shown as a completed trade.</p>
          <div className="lp-steps">
            {[
              { i: LuEye, t: 'Understand', d: 'Browse markets and read the AI’s analysis: trend, volatility, bull and bear cases, and the risks.' },
              { i: LuLayers, t: 'Choose a contract', d: 'Compare calls and puts across strikes and expiries. Verified prices are separated from estimates.' },
              { i: LuGauge, t: 'Check the risk', d: 'Independent checks confirm collateral, limits and pricing before anything can be signed.' },
              { i: LuWallet, t: 'Sign and track', d: 'Approve in your NEAR wallet, then follow submission, execution and settlement separately.' },
            ].map((s, i) => (
              <div key={s.t} className="lp-step">
                <span className="tl-ic ai"><s.i size={17} /></span>
                <h4>{i + 1}. {s.t}</h4>
                <p className="muted small">{s.d}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="lp-sec" id="modes">
          <h2>You choose how much the AI can do</h2>
          <p className="lead">Connecting a wallet never gives the AI permission to trade. Start in Advisory and move up only when you are ready.</p>
          <div className="lp-modes">
            {[
              { n: 'Advisory', t: 'The AI explains. You act.', li: ['Market analysis and education', 'Recommendations and no-trade calls', 'Nothing executes without you'] },
              { n: 'Approval', t: 'The AI proposes. You approve.', li: ['Structured trade proposals', 'Evidence, risks and alternatives', 'Approved trades still pass every check'], hl: true },
              { n: 'Automatic', t: 'The AI acts within your limits.', li: ['Only the assets and sizes you allow', 'Every trade passes the policy engine', 'Pause or revoke in one click'] },
            ].map((m) => (
              <div key={m.n} className={`lp-mode ${m.hl ? 'hl' : ''}`}>
                <h4>{m.n}</h4>
                <div className="bold">{m.t}</div>
                <ul>{m.li.map((l) => <li key={l}><LuCheck size={15} style={{ flex: 'none', marginTop: 4 }} />{l}</li>)}</ul>
              </div>
            ))}
          </div>
        </section>

        <section className="lp-sec" id="safety">
          <h2>Four layers, one clear chain of authority</h2>
          <div className="lp-layers">
            {[
              { i: LuScanSearch, t: 'The AI is the intelligence', d: 'It analyses, explains, recommends or abstains. It can say no trade.' },
              { i: LuEye, t: 'You are the authority', d: 'Approve, reject, pause or revoke. Permissions are explicit and visible.' },
              { i: LuScale, t: 'The policy engine is the control', d: 'Deterministic checks run independently of the AI and cannot be bypassed.' },
              { i: LuZap, t: 'NEAR is the infrastructure', d: 'Wallet-authorized transactions with receipts you can follow.' },
            ].map((l) => (
              <div key={l.t} className="lp-layer">
                <span className="tl-ic ai"><l.i size={17} /></span>
                <b>{l.t}</b>
                <p>{l.d}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="lp-sec" id="preview">
          <h2>See the whole account at a glance</h2>
          <p className="lead">Illustrative interface preview · simulated figures, not live account data.</p>
          <div className="lp-prev">
            <MCard title="Daily P&L" sub={<><span>30 days</span><Growth v={6.8} /></>} href="">
              <Lollipop data={Array.from({ length: 48 }, (_, i) => 30 + Math.abs(Math.sin(i / 5)) * 60 + i * 1.4 + ((i * 37) % 17))} height={140} fmt={(v) => `$${Math.round(v * 6)}`} />
              <div className="mcard-f"><MStat label="Realized" value="$2,800" /><MStat label="Unrealized" value="+$1,962" /></div>
            </MCard>
            <MCard title="Exposure" sub={<><span>By asset</span><Growth v={-2.1} /></>}>
              <TickDonut size={170} centerLabel="At risk" centerValue="14%" data={[{ label: 'NVDA', value: 38 }, { label: 'TSLA', value: 24 }, { label: 'AMZN', value: 22 }, { label: 'AAPL', value: 16 }]} />
            </MCard>
            <MCard title="Realized P&L" sub={<><span>Monthly</span><Growth v={24} /></>}>
              <Bars height={140} data={['J', 'J', 'A', 'S', 'O', 'N'].map((l, i) => ({ label: l, value: [1180, -220, 310, 210, 1120, 180][i] }))} fmt={(v) => `$${v}`} selected={4} />
              <div className="mcard-f"><MStat label="Total" value="$2,780" /><MStat label="Win rate" value="71%" /></div>
            </MCard>
          </div>
        </section>

        <div className="lp-cta">
          <div>
            <h2 className="display" style={{ fontSize: 'clamp(24px,3vw,36px)', textTransform: 'uppercase', fontWeight: 800, maxWidth: '20ch', lineHeight: 1.1 }}>Try the full workflow in minutes</h2>
            <p className="muted" style={{ marginTop: 10, maxWidth: '48ch' }}>Connect a NEAR Testnet wallet and use the bounded wNEAR Call/Put flow. Market quotes and premiums remain fixtures; this is not a live equities exchange.</p>
          </div>
          <button className="btn btn-gold btn-lg" onClick={() => go('/connect')}>Open Testnet app <LuArrowUpRight size={16} /></button>
        </div>
        <footer className="lp-footer">
          <div className="lf-top">
            <div className="lf-brand">
              <Brand />
              <p>Options trading on NEAR with an AI that proposes and a policy engine that checks. You stay in control of every signature.</p>
              <div className="lf-status"><span className="dot" style={{ color: 'var(--amber)', width: 7, height: 7 }} />NEAR Testnet prototype · market data not connected</div>
              <div className="lf-social">
                <a href="https://github.com/devshaydez/handel" target="_blank" rel="noreferrer" aria-label="GitHub"><LuGithub size={16} /></a>
              </div>
            </div>
            {[
              { h: 'Product', l: [['How it works', 'how'], ['Modes', 'modes'], ['Safety', 'safety'], ['Preview', 'preview']] },
              { h: 'Resources', l: [['Documentation', 'https://github.com/devshaydez/handel/tree/main/docs'], ['API reference', 'https://github.com/devshaydez/handel/blob/main/docs/ADVISORY_API.md'], ['System status', 'https://handel-live.vercel.app/api/health']] },
              
              
            ].map((c) => (
              <nav key={c.h} className="lf-col" aria-label={c.h}>
                <h5>{c.h}</h5>
                {c.l.map(([n, id]) => (
                  <a key={n} href={id?.startsWith("https://") ? id : "#" + (id ?? "")} target={id?.startsWith("https://") ? "_blank" : undefined} rel={id?.startsWith("https://") ? "noreferrer" : undefined} onClick={(e) => { if (id?.startsWith("https://")) return; e.preventDefault(); if (id) scrollTo(id); }}>{n}</a>
                ))}
              </nav>
            ))}
          </div>
          <div className="lf-bottom">
            <span>© 2026 Handel. NEAR Testnet prototype. Live market pricing and real-asset execution are not connected; Testnet tokens have no real-world value.</span>
            <span className="lf-net"><LuZap size={13} />Built on NEAR</span>
          </div>
          <p className="lf-risk">Options involve risk and are not suitable for everyone. You can lose the entire premium paid. Handel does not provide investment advice. Testnet automatic execution is bounded by the on-chain policy; the principal signs collateral and the holder separately signs premium.</p>
        </footer>
      </div>
    </div>
  );
}
