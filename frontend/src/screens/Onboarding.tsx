import { useState } from 'react';
import { LuArrowLeft, LuCheck, LuCircleCheck, LuEye, LuKey, LuLoader, LuLock, LuGauge, LuWallet, LuX } from 'react-icons/lu';
import { HeroArt } from '../components/HeroArt';
import { Brand } from '../components/Shell';
import { Accordion, Badge, Banner, Button, DemoTag } from '../components/ui';
import { NETWORK } from '../data/mock';
import type { Mode } from '../data/types';
import { go } from '../router';
import { connectWallet, enterReadOnly, startMode, useStore } from '../state/store';
import { usd } from '../lib/pricing';
import { connectNearWallet } from '../lib/near-wallet';

const STEPS = ['How it works', 'Connect', 'Account', 'Start'];

export default function Onboarding() {
  const s = useStore();
  const [step, setStep] = useState(s.wallet.connected ? 2 : 0);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>('approval');
  const [walletError, setWalletError] = useState('');

  const connect = async () => {
    setBusy(true);
    setWalletError('');
    try {
      const account = await connectNearWallet();
      await connectWallet(account.accountId, account.network);
      setStep(2);
    } catch (error) {
      setWalletError(error instanceof Error ? error.message : 'Wallet connection failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ob">
      <aside className="ob-side">
        <Brand />
        <div style={{ width: '100%', maxWidth: 380, margin: '0 auto', paddingLeft: 34 }}>
          <HeroArt />
        </div>
        <div>
          <div className="display" style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.15, maxWidth: '16ch' }}>The AI proposes. You decide.</div>
          <p style={{ marginTop: 8, maxWidth: '38ch', opacity: 0.8 }}>The policy engine checks every action before it can reach your wallet.</p>
        </div>
      </aside>
      <main className="ob-main">
        <div className="row between">
          <button className="btn btn-ghost btn-sm" onClick={() => (step === 0 ? go('/') : setStep(step - 1))}><LuArrowLeft size={14} /> {step === 0 ? 'Home' : 'Back'}</button>
          <DemoTag />
        </div>
        <div className="stepper" aria-label="Setup progress">
          {STEPS.map((t, i) => (
            <div key={t} style={{ display: 'contents' }}>
              <div className={`step ${i === step ? 'on' : i < step ? 'done' : ''}`}>
                <span className="n">{i < step ? <LuCheck size={12} /> : i + 1}</span>
                <span className="t">{t}</span>
              </div>
              {i < STEPS.length - 1 && <span className="sep" />}
            </div>
          ))}
        </div>

        {step === 0 && (
          <div className="col gap16">
            <h1 className="display" style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.1 }}>Welcome to Handel</h1>
            <p className="muted">Handel helps you understand options, find opportunities and manage positions, with an AI assistant built in. Here is how it works.</p>
            <div className="col gap8">
              {[
                { i: LuEye, t: 'Learn and analyse', d: 'Read market analysis and plain-language explanations for every option term.' },
                { i: LuGauge, t: 'Independent risk checks', d: 'Collateral, limits and pricing are verified by a rules engine, not by the AI.' },
                { i: LuWallet, t: 'You sign everything', d: 'Trades need your NEAR wallet signature unless you explicitly grant limited automation.' },
              ].map((x) => (
                <div key={x.t} className="row gap12 start card" style={{ padding: 14, borderRadius: 16 }}>
                  <span className="tl-ic ai"><x.i size={17} /></span>
                  <div><div className="semi">{x.t}</div><div className="small muted">{x.d}</div></div>
                </div>
              ))}
            </div>
            <Banner tone="gold"><b>Connecting a wallet does not let the AI trade.</b> Trading authority is a separate choice you make later, and you can revoke it at any time.</Banner>
            <Button variant="gold" size="lg" onClick={() => setStep(1)}>Continue</Button>
          </div>
        )}

        {step === 1 && (
          <div className="col gap16">
            <h1 className="display" style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.1 }}>Connect your NEAR wallet</h1>
            <p className="muted">Handel will see your account ID and network, and ask you to sign each trade. It never sees your keys.</p>
            <button className="big-select" onClick={connect} disabled={busy}>
              <span className="row gap12">
                <span className="tl-ic ai"><LuWallet size={18} /></span>
                <span><div className="semi">NEAR wallet</div><div className="small muted">Connect a NEAR Testnet wallet to sign transactions</div></span>
              </span>
              {busy ? <LuLoader size={18} className="spin" /> : <Badge tone="gold">Connect</Badge>}
            </button>
            {walletError && <Banner tone="danger">{walletError}</Banner>}
            <Button variant="soft" onClick={() => { enterReadOnly(); go('/app'); }}>Explore read-only without a wallet</Button>
            <Accordion title="What does connecting allow?">
              <div className="col gap8 small">
                <div className="row gap8 start"><LuCheck size={15} className="green" style={{ marginTop: 3 }} /><span>Handel reads your account ID and which network you are on.</span></div>
                <div className="row gap8 start"><LuCheck size={15} className="green" style={{ marginTop: 3 }} /><span>Handel can ask you to sign a specific transaction. You review each one.</span></div>
                <div className="row gap8 start"><LuX size={15} className="red" style={{ marginTop: 3 }} /><span>Connecting does not grant the AI any permission to trade.</span></div>
                <div className="row gap8 start"><LuX size={15} className="red" style={{ marginTop: 3 }} /><span>Handel never has access to your private keys.</span></div>
              </div>
            </Accordion>
          </div>
        )}

        {step === 2 && (
          <div className="col gap16">
            <h1 className="display" style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.1 }}>Your account is ready</h1>
            <div className="card" style={{ padding: 6 }}>
              {[
                { l: 'Wallet detected', v: s.wallet.account || 'Not connected', ok: s.wallet.connected },
                { l: 'Network verified', v: NETWORK, ok: true },
                { l: 'Collateral balance', v: 'Testnet token balance checked on-chain before trade', ok: false },
                { l: 'AI trading permission', v: 'None granted', ok: false },
              ].map((r) => (
                <div key={r.l} className="row between gap12" style={{ padding: '12px 14px', borderBottom: '1px solid var(--line)' }}>
                  <span className="row gap8">{r.ok ? <LuCircleCheck size={16} className="green" /> : <LuLock size={16} className="muted" />}{r.l}</span>
                  <span className="semi mono">{r.v}</span>
                </div>
              ))}
            </div>
            <Banner tone="warn">This is Testnet with simulated settlement. It does not demonstrate real-asset custody.</Banner>
            <Button variant="gold" size="lg" onClick={() => setStep(3)}>Continue</Button>
          </div>
        )}

        {step === 3 && (
          <div className="col gap16">
            <h1 className="display" style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.1 }}>How do you want to start?</h1>
            <p className="muted">You can change this at any time in Agent settings.</p>
            <div className="col gap8">
              {([
                { m: 'advisory' as const, t: 'Advisory', d: 'The AI analyses and recommends. You make every trade yourself.', tag: 'Safest for new users' },
                { m: 'approval' as const, t: 'Approval', d: 'The AI writes trade proposals. You approve or reject each one.', tag: 'Best for trying the demo' },
              ]).map((o) => (
                <button key={o.m} className={`radio-card ${mode === o.m ? 'on' : ''}`} onClick={() => setMode(o.m)} aria-pressed={mode === o.m}>
                  <div className="row between"><b className="big">{o.t}</b>{o.tag && <Badge tone="gold" sm>{o.tag}</Badge>}</div>
                  <span className="small muted">{o.d}</span>
                </button>
              ))}
              <div className="radio-card" style={{ opacity: 0.55 }}>
                <div className="row between"><b className="big">Automatic execution</b><Badge sm tone="outline"><LuLock size={11} /> Set up later</Badge></div>
                <span className="small muted">Needs limits you configure in Agent settings first.</span>
              </div>
            </div>
            <Button variant="gold" size="lg" onClick={() => { startMode(mode); go('/app'); }}>Enter dashboard</Button>
          </div>
        )}
        <span className="hide"><LuKey /></span>
      </main>
    </div>
  );
}
