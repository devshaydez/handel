import { useEffect, useState } from 'react';
import { LuBookOpen, LuCheck, LuCircleHelp, LuCopy, LuLogOut, LuKeyRound, LuUnplug } from 'react-icons/lu';
import { Badge, Banner, Button, Card, CardHead, KV, PageHead, Switch, Tabs } from '../components/ui';
import { NETWORK } from '../data/mock';
import { go } from '../router';
import { agentStatus, connectWallet, disconnectWallet, setNotifPref, setTxPref, toast, useStore } from '../state/store';
import { usd } from '../lib/pricing';
import { configureTestnetEscrow, connectNearWallet, getTestnetWnearBalance } from '../lib/near-wallet';

type T = 'account' | 'security' | 'notifications' | 'integrations' | 'help';
const NOTIF: [string, string, string][] = [['proposals', 'New proposals', 'When the AI creates a proposal or recommendation'], ['approvals', 'Approval requests', 'When something needs your decision'], ['tx', 'Transaction status changes', 'Submitted, confirmed, and settlement updates'], ['expiry', 'Position expiry', 'Before and after an option expires'], ['risk', 'Risk warnings', 'Stale data, blocked actions and limits'], ['restrictions', 'Agent restrictions', 'Mode, pause and revoke changes'], ['failed', 'Failed or unresolved actions', 'Anything that needs a second look']];

export default function Settings() {
  const s = useStore();
  const [tab, setTab] = useState<T>('account');
  const [wnearBalance, setWnearBalance] = useState<number | null>(null);
  const [wnearLoading, setWnearLoading] = useState(false);
  const [wnearError, setWnearError] = useState('');
  const [escrowSetupBusy, setEscrowSetupBusy] = useState(false);
  const [escrowSetupError, setEscrowSetupError] = useState('');
  const st = agentStatus(s);
  const refreshWnearBalance = async (accountId: string) => {
    setWnearLoading(true);
    setWnearError('');
    try { setWnearBalance(await getTestnetWnearBalance(accountId)); }
    catch (error) { setWnearBalance(null); setWnearError(error instanceof Error ? error.message : 'Could not verify the wNEAR balance.'); }
    finally { setWnearLoading(false); }
  };
  useEffect(() => {
    if (!s.wallet.connected || !s.wallet.account) { setWnearBalance(null); setWnearError(''); return; }
    let cancelled = false;
    setWnearLoading(true);
    setWnearError('');
    getTestnetWnearBalance(s.wallet.account).then((balance) => { if (!cancelled) setWnearBalance(balance); })
      .catch((error) => { if (!cancelled) { setWnearBalance(null); setWnearError(error instanceof Error ? error.message : 'Could not verify the wNEAR balance.'); } })
      .finally(() => { if (!cancelled) setWnearLoading(false); });
    return () => { cancelled = true; };
  }, [s.wallet.connected, s.wallet.account]);
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
                <KV k="Network" v={s.wallet.network} /><KV k="Status" v={<Badge tone="green" sm>Connected</Badge>} /><KV k="Testnet USDC balance" v={usd(s.balance, 2)} />
                <KV k="Testnet wNEAR balance" v={wnearLoading ? 'Checking…' : wnearBalance === null ? 'Unavailable' : `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(wnearBalance)} wNEAR`} />
                {wnearError && <div className="row between gap8"><span className="small muted">{wnearError}</span><button className="link small" onClick={() => refreshWnearBalance(s.wallet.account)}>Retry</button></div>}
                <div className="row gap8 mt16"><Button icon={<LuUnplug size={14} />} onClick={async () => { try { await disconnectWallet(); go('/connect'); } catch (error) { toast('danger', error instanceof Error ? error.message : 'Wallet disconnect failed'); } }}>Disconnect wallet</Button></div>
              </>
            ) : (
              <div className="col gap12"><p className="muted">{s.wallet.readOnly ? 'You’re in read-only mode.' : 'No wallet connected.'} Connect to sign trades.</p><Button variant="gold" onClick={async () => { try { const account = await connectNearWallet(); await connectWallet(account.accountId, account.network); toast('success', 'NEAR Testnet wallet connected and Testnet USDC balance checked'); } catch (error) { toast('danger', error instanceof Error ? error.message : 'Wallet connection failed'); } }}>Connect NEAR wallet</Button></div>
            )}
          </Card>
          <Card>
            <CardHead title="Agent authority" right={<button className="link small" onClick={() => go('/app/agent')}>Manage</button>} />
            <p className="small muted">The authoritative trading permissions live on OptionsContract. Open Agent settings to read the current policy and execution mode directly from NEAR Testnet. Browser-side preferences do not grant trading authority.</p>
            <Button size="sm" onClick={() => go('/app/agent')}>View on-chain permissions</Button>
          </Card>
          <Card>
            <CardHead title="Transaction preferences" />
            <div className="col gap16">
              <div className="row between gap12"><div><div className="semi">Review before signing</div><div className="small muted">Always show the wallet request step.</div></div><Switch on={s.txPrefs.reviewBeforeSign} onChange={(v) => { setTxPref({ reviewBeforeSign: v }); toast('info', v ? 'Review step on' : 'Review step off'); }} label="Review before signing" /></div>
              <div className="field"><span className="label">Default quantity</span><select className="select" value={s.txPrefs.defaultQty} onChange={(e) => { setTxPref({ defaultQty: Number(e.target.value) }); toast('success', 'Saved'); }}>{[1, 2, 3, 5].map((n) => <option key={n}>{n}</option>)}</select></div>
              <div className="field"><span className="label">Price tolerance: {s.txPrefs.maxSlippagePct}%</span><input className="range" type="range" min={0.5} max={5} step={0.5} value={s.txPrefs.maxSlippagePct} onChange={(e) => setTxPref({ maxSlippagePct: Number(e.target.value) })} aria-label="Price tolerance" /></div>
            </div>
          </Card>
          
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
            <Banner tone="warn">Testnet-only synthetic assets and simulated market data. Escrow settlement is verified on-chain through NEP-141 callbacks and independent RPC state; this is not real-asset custody.</Banner>
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
          {[['NEAR wallet', 'NEAR Testnet wallet-selector signing', 'Connected wallet', 'green'], ['Options execution', 'Principal-signed OptionsContract calls', 'Testnet', 'green'], ['Escrow settlement', 'NEP-141 transfer_call and callback-confirmed payouts', 'Testnet', 'green'], ['Market data', 'Synthetic option quotes and wNEAR test-token proxy', 'Demo data', 'gold'], ['NEAR Intents', 'Not used for this NEP-141 escrow demo path', 'Not enabled', 'outline'], ['Direct stock execution', 'Not part of the current verified scope', 'Not available', 'outline']].map(([t, d, b, tone]) => (
            <Card key={t}><div className="row between start gap12"><div><div className="semi">{t}</div><div className="small muted">{d}</div></div><Badge tone={tone as 'gold'}>{b}</Badge></div></Card>
          ))}
          <div className="span2 card col gap12" style={{ padding: 16 }}>
            <div className="semi">Configure Testnet escrow</div>
            <div className="small muted">Uses your connected wallet to register wNEAR and test USDC, bind token contracts, enable the escrow's Testnet-only self-trade demo mode, and authorize the OptionsContract as controller. The signer must own both contract accounts.</div>
            {escrowSetupError && <Banner tone="danger">{escrowSetupError}</Banner>}
            <Button variant="gold" disabled={!s.wallet.connected || escrowSetupBusy} onClick={async () => {
              setEscrowSetupBusy(true); setEscrowSetupError('');
              try { await configureTestnetEscrow(); toast('success', 'Testnet escrow configuration submitted'); }
              catch (error) { setEscrowSetupError(error instanceof Error ? error.message : 'Escrow configuration failed.'); }
              finally { setEscrowSetupBusy(false); }
            }}>{escrowSetupBusy ? 'Configuring contracts…' : 'Configure Testnet escrow'}</Button>
          </div>
          <div className="span2"><Banner tone="info">Market prices and option premiums are synthetic demo data. The underlying asset used for Testnet escrow is Tidepool wNEAR; it is not an NVDA, TSLA or AAPL token. Settlement completion is based on NEP-141 transfer callbacks and matching state from two independent Testnet RPCs, not a trusted reconciler. Demo self-trading is enabled only on the Testnet escrow.</Banner></div>
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
            <p className="text2 small">This Testnet prototype sends Assistant messages to the configured Handel backend and NEAR AI service. Wallet signing stays inside your connected NEAR wallet; Handel does not receive your wallet private key. Privacy and retention terms are not yet finalized, so do not submit sensitive personal information.</p>
            
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
