import { useState } from 'react';
import { LuArrowLeft, LuCheck, LuCircleCheck, LuEye, LuGauge, LuLock, LuWallet, LuX, LuLoader } from 'react-icons/lu';
import { HeroArt } from '../components/HeroArt';
import { Brand } from '../components/Shell';
import { Accordion, Badge, Banner, Button, Card } from '../components/ui';
import { NETWORK } from '../data/mock';
import { go } from '../router';
import { connectWallet, enterReadOnly, useStore } from '../state/store';
import { connectNearWallet } from '../lib/near-wallet';

const STEPS = ['How it works', 'Connect', 'Account', 'Start'];

export default function Onboarding() {
  const s = useStore();
  const [step, setStep] = useState(s.wallet.connected ? 2 : 0);
  const [busy, setBusy] = useState(false);
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
          <div className="display" style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.15, maxWidth: '16ch' }}>You control the agent’s on-chain authority.</div>
          <p style={{ marginTop: 8, maxWidth: '38ch', opacity: 0.8 }}>Automatic execution stays off until the principal signs an enabled policy on NEAR Testnet.</p>
        </div>
      </aside>
      <main className="ob-main">
        <div className="row between">
          <button className="btn btn-ghost btn-sm" onClick={() => (step === 0 ? go('/') : setStep(step - 1))}><LuArrowLeft size={14} /> {step === 0 ? 'Home' : 'Back'}</button>
          <Badge tone="outline">NEAR Testnet prototype</Badge>
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
            <p className="muted">Handel explains the Testnet options flow and supports explicit writer-side wNEAR Call/Put creation under an on-chain policy. Live market prices and option quotes are not connected.</p>
            <div className="col gap8">
              {[
                { i: LuEye, t: 'Ask and understand', d: 'Get explanations of the Testnet Call/Put flow, collateral and settlement.' },
                { i: LuGauge, t: 'On-chain policy checks', d: 'OptionsContract enforces the allowed asset, size, collateral, position-count and expiry caps.' },
                { i: LuWallet, t: 'You control authority', d: 'The principal signs policy and collateral. The holder separately signs premium. The restricted agent key cannot transfer tokens.' },
              ].map((x) => (
                <div key={x.t} className="row gap12 start card" style={{ padding: 14, borderRadius: 16 }}>
                  <span className="tl-ic ai"><x.i size={17} /></span>
                  <div><div className="semi">{x.t}</div><div className="small muted">{x.d}</div></div>
                </div>
              ))}
            </div>
            <Banner tone="gold"><b>Connecting a wallet does not enable automatic execution.</b> Only a principal-signed, enabled on-chain policy can authorize Delegated mode. You can pause or revoke it from Agent settings.</Banner>
            <Button variant="gold" size="lg" onClick={() => setStep(1)}>Continue</Button>
          </div>
        )}

        {step === 1 && (
          <div className="col gap16">
            <h1 className="display" style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.1 }}>Connect your NEAR wallet</h1>
            <p className="muted">Handel reads your account ID and network. Wallet prompts are required for policy changes and principal collateral funding. It never sees your private keys.</p>
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
                <div className="row gap8 start"><LuCheck size={15} className="green" style={{ marginTop: 3 }} /><span>Handel can request a wallet signature for a specific policy or token transaction. You review each one.</span></div>
                <div className="row gap8 start"><LuX size={15} className="red" style={{ marginTop: 3 }} /><span>Connecting does not grant the AI permission to trade.</span></div>
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
                { l: 'Network', v: NETWORK, ok: true },
                { l: 'Token balances', v: 'Check USDC and wNEAR in Settings before funding', ok: false },
                { l: 'On-chain agent authority', v: 'Read current policy in Agent settings', ok: false },
              ].map((r) => (
                <div key={r.l} className="row between gap12" style={{ padding: '12px 14px', borderBottom: '1px solid var(--line)' }}>
                  <span className="row gap8">{r.ok ? <LuCircleCheck size={16} className="green" /> : <LuLock size={16} className="muted" />}{r.l}</span>
                  <span className="semi mono">{r.v}</span>
                </div>
              ))}
            </div>
            <Banner tone="warn">This is NEAR Testnet. Transactions use synthetic test assets; they are real Testnet transactions, not real-asset custody.</Banner>
            <Button variant="gold" size="lg" onClick={() => setStep(3)}>Continue</Button>
          </div>
        )}

        {step === 3 && (
          <div className="col gap16">
            <h1 className="display" style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.1 }}>Set up your authority when ready</h1>
            <p className="muted">Handel starts without delegated trading authority. The on-chain policy is configured separately and only by the principal wallet.</p>
            <Card>
              <div className="row between"><b className="big">ManualApproval by default</b><Badge tone="outline">No delegated execution</Badge></div>
              <p className="small muted mt8">To enable automatic execution, open Agent settings, choose your own wNEAR, USDC, position-count and expiry limits, then sign the policy transaction in your principal wallet. The contract must confirm an enabled policy before the UI reports Delegated.</p>
            </Card>
            <Button variant="gold" size="lg" onClick={() => go('/app/agent')}>Configure on-chain permissions</Button>
            <Button variant="soft" onClick={() => go('/app')}>Enter dashboard without enabling automatic execution</Button>
          </div>
        )}
      </main>
    </div>
  );
}
