import { useState } from 'react';
import { LuBookOpen, LuCheck, LuCircleHelp, LuCopy, LuLogOut, LuKeyRound, LuUnplug } from 'react-icons/lu';
import { DemoControls } from '../components/Shell';
import { Badge, Banner, Button, Card, CardHead, KV, PageHead, Switch, Tabs } from '../components/ui';
import { NETWORK } from '../data/mock';
import { go } from '../router';
import { agentStatus, connectWallet, disconnectWallet, resetDemo, setNotifPref, setTxPref, toast, useStore } from '../state/store';
import { usd } from '../lib/pricing';

type T = 'account' | 'security' | 'notifications' | 'integrations' | 'help';
const NOTIF: [string, string, string][] = [['proposals', 'New proposals', 'When the AI creates a proposal or recommendation'], ['approvals', 'Approval requests', 'When something needs your decision'], ['tx', 'Transaction status changes', 'Submitted, confirmed, and settlement updates'], ['expiry', 'Position expiry', 'Before and after an option expires'], ['risk', 'Risk warnings', 'Stale data, blocked actions and limits'], ['restrictions', 'Agent restrictions', 'Mode, pause and revoke changes'], ['failed', 'Failed or unresolved actions', 'Anything that needs a second look']];

export default function Settings() {
  const s = useStore();
  const [tab, setTab] = useState<T>('account');
  const st = agentStatus(s);
  return (
    <div className="page">
      <PageHead title="Settings and security" sub="Your wallet, what Handel can access, and how you’re notified." />
      <Tabs value={tab} onChange={setTab} tabs={[{ v: 'account', label: 'Account' }, { v: 'security', label: 'Security' }, { v: 'notifications', label: 'Notifications' }, { v: 'integrations', label: 'Integrations' }, { v: 'help', label: 'Help and privacy' }]} />

      {tab === 'account' && (
        <div className="grid g2">
          <Card>
            <CardHead title="Connected wallet" />
            {s.wallet.connected ? (
              <>
                <KV k="Account" v={<span className="row gap8 mono"><span>{s.wallet.account}</span><button aria-label="Copy account ID" onClick={() => { navigator.clipboard?.writeText(s.wallet.account).catch(() => {}); toast('success', 'Account ID copied'); }}><LuCopy size={13} className="muted" /></button></span>} />
                <KV k="Network" v={s.wallet.network} /><KV k="Status" v={<Badge tone="green" sm>Connected</Badge>} /><KV k="Demo balance" v={`${usd(s.balance)} USDC`} />
                <div className="row gap8 mt16"><Button icon={<LuUnplug size={14} />} onClick={() => { disconnectWallet(); go('/connect'); }}>Disconnect wallet</Button></div>
              </>
            ) : (
              <div className="col gap12"><p className="muted">{s.wallet.readOnly ? 'You’re in read-only mode.' : 'No wallet connected.'} Connect to sign trades.</p><Button variant="gold" onClick={() => { connectWallet(); toast('success', 'Wallet connected'); }}>Connect mock wallet</Button></div>
            )}
          </Card>
          <Card>
            <CardHead title="Agent permissions overview" right={<button className="link small" onClick={() => go('/app/agent')}>Manage</button>} />
            <KV k="Mode" v={s.mode === 'auto' ? 'Automatic' : s.mode === 'approval' ? 'Approval' : 'Advisory'} /><KV k="Agent status" v={st.label} /><KV k="Authorization" v={s.authorization.status} />
            <KV k="Allowed assets" v={s.policy.assets.join(', ') || 'None'} /><KV k="Max premium" v={usd(s.policy.maxPremiumUsd, 0)} />
          </Card>
          <Card>
            <CardHead title="Transaction preferences" />
            <div className="col gap16">
              <div className="row between gap12"><div><div className="semi">Review before signing</div><div className="small muted">Always show the wallet request step.</div></div><Switch on={s.txPrefs.reviewBeforeSign} onChange={(v) => { setTxPref({ reviewBeforeSign: v }); toast('info', v ? 'Review step on' : 'Review step off'); }} label="Review before signing" /></div>
              <div className="field"><span className="label">Default quantity</span><select className="select" value={s.txPrefs.defaultQty} onChange={(e) => { setTxPref({ defaultQty: Number(e.target.value) }); toast('success', 'Saved'); }}>{[1, 2, 3, 5].map((n) => <option key={n}>{n}</option>)}</select></div>
              <div className="field"><span className="label">Price tolerance: {s.txPrefs.maxSlippagePct}%</span><input className="range" type="range" min={0.5} max={5} step={0.5} value={s.txPrefs.maxSlippagePct} onChange={(e) => setTxPref({ maxSlippagePct: Number(e.target.value) })} aria-label="Price tolerance" /></div>
            </div>
          </Card>
          <Card><CardHead title="Demo controls" sub="Prototype only. Not part of the product." /><DemoControls /></Card>
        </div>
      )}

      {tab === 'security' && (
        <div className="grid g2">
          <Card>
            <CardHead title="How authorization works" icon={<LuKeyRound size={16} />} />
            <div className="col gap12">
              {[['Connecting a wallet', 'Lets Handel read your account ID and network. It grants no trading permission.'], ['Signing a transaction', 'Authorizes only that one action, after you review it.'], ['Agent permissions', 'A separate setting. Off unless you enable Approval or Automatic mode.'], ['Policy engine', 'Checks every action independently of the AI. The AI cannot bypass it.'], ['Revoking', 'Pause or revoke any time from the Agent page. It takes effect immediately.']].map(([t, d]) => <div key={t} className="row gap12 start"><LuCheck size={16} className="green" style={{ marginTop: 3, flex: 'none' }} /><div><div className="semi">{t}</div><div className="small muted">{d}</div></div></div>)}
            </div>
          </Card>
          <Card>
            <CardHead title="Security status" />
            <KV k="Private keys" v="Never shared with Handel" /><KV k="Network" v={NETWORK} /><KV k="Active delegation" v={s.authorization.status === 'delegated' ? s.authorization.id : 'None'} />
            <Banner tone="warn">Testnet and simulated settlement. This prototype does not demonstrate real-asset custody or settlement.</Banner>
            <div className="row gap8 mt16"><Button variant="danger" icon={<LuLogOut size={14} />} onClick={() => go('/app/agent')}>Go to revoke agent access</Button></div>
          </Card>
        </div>
      )}

      {tab === 'notifications' && (
        <Card>
          <CardHead title="Alert me about" />
          {NOTIF.map(([k, t, d]) => <NotifRow key={k} k={k} t={t} d={d} />)}
        </Card>
      )}

      {tab === 'integrations' && (
        <div className="grid g2">
          {[['NEAR wallet', 'Wallet authorization and signing', 'Mocked', 'gold'], ['NEAR Intents', 'Settlement route. Capabilities depend on the asset', 'Simulated', 'gold'], ['Market data', 'Prices, volatility and news', 'Demo feed', 'gold'], ['Options execution', 'Long calls and long puts only', 'Mocked', 'gold'], ['Direct stock execution', 'Not part of the current verified scope', 'Not available', 'outline'], ['Spreads and covered strategies', 'Not implemented by the backend yet', 'Not available', 'outline']].map(([t, d, b, tone]) => (
            <Card key={t}><div className="row between start gap12"><div><div className="semi">{t}</div><div className="small muted">{d}</div></div><Badge tone={tone as 'gold'}>{b}</Badge></div></Card>
          ))}
          <div className="span2"><Banner tone="info">These integrations are mocked. Each one is a seam in <span className="mono">src/state/store.ts</span> and <span className="mono">src/data/mock.ts</span> where the real service plugs in.</Banner></div>
        </div>
      )}

      {tab === 'help' && (
        <div className="grid g2">
          <Card>
            <CardHead title="Help and documentation" icon={<LuBookOpen size={16} />} />
            {[['What is an option?', 'A contract giving you the right, not the obligation, to buy (call) or sell (put) at a set price before a date.'], ['What can I lose?', 'On a long option, only the premium you paid. That is the collateral reserved.'], ['What does “Submitted” mean?', 'Sent to the network, not completed. A trade is only open after execution and settlement are verified.'], ['What is “Unresolved”?', 'The outcome could not be confirmed yet. It isn’t a success or a failure. Check again from the position.']].map(([q, a]) => <div key={q} style={{ padding: '10px 0', borderBottom: '1px solid var(--line)' }}><div className="semi">{q}</div><div className="small muted">{a}</div></div>)}
          </Card>
          <Card>
            <CardHead title="Privacy" icon={<LuCircleHelp size={16} />} />
            <p className="text2 small">This prototype stores nothing outside your browser session. In production Handel will keep your decision journal and policy so you can audit them. It will not sell your data. Final privacy terms will be published before launch.</p>
            <div className="row gap8 mt16"><Button onClick={resetDemo}>Reset demo data</Button></div>
          </Card>
        </div>
      )}
    </div>
  );
}

function NotifRow({ k, t, d }: { k: string; t: string; d: string }) {
  const s = useStore();
  const on = s.notifPrefs[k] !== false;
  return (
    <div className="row between gap12" style={{ padding: '12px 0', borderBottom: '1px solid var(--line)' }}>
      <div><div className="semi">{t}</div><div className="small muted">{d}</div></div>
      <Switch on={on} label={t} onChange={(v) => setNotifPref(k, v)} />
    </div>
  );
}
