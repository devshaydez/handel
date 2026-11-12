import { useMemo, useState } from 'react';
import { LuCheck, LuCircleCheck, LuLock } from 'react-icons/lu';
import { PayoffChart } from '../components/charts';
import { SignModal } from '../components/SignModal';
import { ChecksList, CheckVerdict, EvidenceList, SegBars, TradeStatus, TxLanes } from '../components/status';
import { Badge, Banner, Button, Card, CardHead, EmptyState, KV, PageHead, QtyStepper, QualityBadge, Term } from '../components/ui';
import { assetBySym, EXPIRIES, fmtDate, getChain, isoAgo, makeContract, MIN, parseContractId, ROUTE, SUPPORTED_STRATEGIES, UNSUPPORTED_STRATEGIES } from '../data/mock';
import { go, useRoute } from '../router';
import { lockedCollateral, submitOpen, useStore } from '../state/store';
import { runChecks, overall } from '../lib/policy';
import { CONTRACT_SIZE, breakeven, usd, usd0 } from '../lib/pricing';

export default function TradeBuilder() {
  const s = useStore();
  const r = useRoute();
  const cid = r.query.get('c');
  const init = cid ? parseContractId(cid) : null;
  const [sym, setSym] = useState(init?.sym ?? 'NVDA');
  const [side, setSide] = useState<'call' | 'put'>(init?.side ?? 'call');
  const [expiry, setExpiry] = useState(init?.expiry ?? EXPIRIES[2]);
  const [strike, setStrike] = useState<number>(init?.strike ?? 0);
  const [qty, setQty] = useState(s.txPrefs.defaultQty);
  const [step, setStep] = useState<'build' | 'review' | 'track'>('build');
  const [sign, setSign] = useState(false);
  const [tracked, setTracked] = useState<{ hash: string; posId: string } | null>(null);

  const a = assetBySym(sym)!;
  const strikes = useMemo(() => getChain(sym, expiry, s.demo.feed).map((x) => x.strike), [sym, expiry, s.demo.feed]);
  const k = strikes.includes(strike) ? strike : strikes[Math.floor(strikes.length / 2) + 1];
  const c = makeContract(sym, expiry, side, k, s.demo.feed);
  const ask = c.ask;
  const total = (ask ?? 0) * CONTRACT_SIZE * qty;
  const strategy = side === 'call' ? 'Long call' : 'Long put';
  const checks = runChecks(
    { actor: 'user', sym, side, strategy, qty, premium: ask, dte: c.dte, quality: c.quality, optionsSupported: a.optionsSupported, pricingAgeMin: s.demo.feed === 'stale' ? 47 : 2 },
    { policy: s.policy, walletConnected: s.wallet.connected, balance: s.balance, locked: lockedCollateral(s), paused: false, revoked: false, mode: s.mode },
  );
  const verdict = overall(checks);
  const tx = tracked ? s.txs[tracked.hash] : null;
  const ts = isoAgo((s.demo.feed === 'stale' ? 47 : 2) * MIN);
  const be = ask != null ? breakeven(side, k, ask) : 0;
  const maxProfit = side === 'call' ? 'Unlimited' : usd0(Math.max(k - (ask ?? 0), 0) * CONTRACT_SIZE * qty);

  const stepper = (
    <div className="stepper" aria-label="Trade steps">
      {[['build', 'Build'], ['review', 'Review'], ['track', 'Sign and track']].map(([v, l], i, arr) => {
        const idx = ['build', 'review', 'track'].indexOf(step);
        return <div key={v} style={{ display: 'contents' }}><div className={`step ${i === idx ? 'on' : i < idx ? 'done' : ''}`}><span className="n">{i < idx ? <LuCheck size={12} /> : i + 1}</span><span className="t">{l}</span></div>{i < arr.length - 1 && <span className="sep" />}</div>;
      })}
    </div>
  );

  if (!a.optionsSupported) return <div className="page"><EmptyState title="Options not connected" body={`${sym} can’t be traded yet.`} action={<Button onClick={() => go('/app/markets')}>Back to Markets</Button>} /></div>;

  return (
    <div className="page">
      <PageHead crumbs={[{ label: 'Markets', href: '/app/markets' }, { label: sym, href: `/app/markets/${sym}` }, { label: 'Trade' }]} title="Trade builder" sub="Build a long option, see exactly what it costs and risks, then review before anything is signed." />
      {stepper}

      {step === 'build' && (
        <div className="grid g-side">
          <div className="col gap16">
            <Card>
              <CardHead title="Contract" />
              <div className="grid g2">
                <div className="field"><span className="label">Underlying</span><select className="select" value={sym} onChange={(e) => { setSym(e.target.value); setStrike(0); }}>{['NVDA', 'AAPL', 'MSFT', 'TSLA', 'AMZN', 'META'].map((x) => <option key={x}>{x}</option>)}</select></div>
                <div className="field"><span className="label">Strategy</span>
                  <select className="select" value="Long" disabled aria-label="Strategy"><option>{strategy}</option></select>
                  <span className="hint">Only strategies implemented by the backend are available.</span></div>
                <div className="field"><span className="label">Type</span><div className="seg"><button className={side === 'call' ? 'on' : ''} onClick={() => setSide('call')}>Call</button><button className={side === 'put' ? 'on' : ''} onClick={() => setSide('put')}>Put</button></div></div>
                <div className="field"><span className="label"><Term k="expiry">Expiry</Term></span><select className="select" value={expiry} onChange={(e) => setExpiry(e.target.value)}>{EXPIRIES.map((e) => <option key={e} value={e}>{fmtDate(e)}</option>)}</select></div>
                <div className="field"><span className="label"><Term k="strike">Strike</Term></span><select className="select" value={k} onChange={(e) => setStrike(Number(e.target.value))}>{strikes.map((x) => <option key={x} value={x}>{x} {x < a.price ? (side === 'call' ? '(ITM)' : '') : side === 'put' ? '(ITM)' : ''}</option>)}</select></div>
                <div className="field"><span className="label">Quantity (contracts)</span><QtyStepper value={qty} onChange={setQty} max={20} /><span className="hint">1 contract = {CONTRACT_SIZE} shares</span></div>
              </div>
              <div className="row gap8 wrap mt16">
                <span className="small muted">Not yet available:</span>{UNSUPPORTED_STRATEGIES.map((x) => <Badge key={x} tone="outline" sm><LuLock size={10} />{x}</Badge>)}
              </div>
            </Card>
            <Card>
              <CardHead title="Payoff at expiry" sub={ask == null ? 'No pricing evidence' : `Max loss ${usd0(total)} · break-even ${usd(be)}`} />
              {ask == null ? <EmptyState title="No price for this contract" body="Pick another strike or expiry. Handel won’t estimate a price it has no evidence for." /> : <PayoffChart side={side} strike={k} premium={ask} spot={a.price} qty={qty} />}
            </Card>
          </div>
          <div className="col gap16">
            <Card className="glow-gold">
              <CardHead title="Cost and risk" right={<QualityBadge q={c.quality} />} />
              <KV k={<Term k="premium">Premium (ask)</Term>} v={ask != null ? usd(ask) : '—'} />
              <KV k="Estimated total cost" v={ask != null ? usd(total) : '—'} />
              <KV k={<Term k="collateral">Collateral required</Term>} v={ask != null ? usd(total) : '—'} />
              <KV k="Maximum loss" v={<span className="red">{ask != null ? usd(total) : '—'}</span>} />
              <KV k="Potential payoff" v={<span className="green">{maxProfit}</span>} />
              <KV k={<Term k="breakeven">Break-even</Term>} v={ask != null ? usd(be) : '—'} />
              <KV k="Pricing evidence" v={<span className="tiny">{ROUTE.name === '' ? '' : 'Demo oracle'} · {new Date(ts).toISOString().slice(11, 16)} UTC</span>} />
            </Card>
            <Card>
              <CardHead title="Independent checks" right={<CheckVerdict checks={checks} />} sub="Run by the platform, not by the AI." />
              <SegBars checks={checks} lg />
              <div className="mt8"><ChecksList checks={checks} compact /></div>
            </Card>
            <Button variant="gold" size="lg" block disabled={verdict === 'fail' || ask == null} onClick={() => setStep('review')}>Review trade</Button>
            {verdict === 'fail' && <p className="small red">Fix the failed checks above to continue.</p>}
          </div>
        </div>
      )}

      {step === 'review' && (
        <div className="grid g-side">
          <div className="col gap16">
            <Card className="glow-gold">
              <CardHead title="Final review" sub="Nothing has been submitted. You will sign in your wallet next." right={<TradeStatus stage="draft" />} />
              <div className="grid g2">
                <div><KV k="Underlying" v={`${a.name} (${sym})`} /><KV k="Strategy" v={strategy} /><KV k="Contract" v={`${k} ${side} · ${fmtDate(expiry)}`} /><KV k="Quantity" v={`${qty} contract${qty > 1 ? 's' : ''} (${qty * CONTRACT_SIZE} shares)`} /></div>
                <div><KV k="Premium" v={`${usd(ask ?? 0)} per share`} /><KV k="Total cost" v={usd(total)} /><KV k="Maximum loss" v={<span className="red">{usd(total)}</span>} /><KV k="Break-even" v={usd(be)} /></div>
              </div>
            </Card>
            <Card>
              <CardHead title="What could happen" />
              <ul className="col gap8 text2" style={{ paddingLeft: 18, listStyle: 'disc' }}>
                <li>If {sym} finishes {side === 'call' ? 'above' : 'below'} {usd(be)} at expiry, you profit.</li>
                <li>If it finishes {side === 'call' ? 'below' : 'above'} {usd(k)}, the option expires worthless and you lose {usd0(total)}, and no more.</li>
                <li>You can close early at the then-current price, so you don’t have to wait for expiry.</li>
              </ul>
            </Card>
            <Card><CardHead title="Pricing evidence" /><EvidenceList items={[{ label: 'Underlying price', value: usd(a.price), source: 'Demo market feed', ts, quality: 'simulated' }, { label: 'Option ask', value: usd(ask ?? 0), source: 'Demo pricing oracle', ts, quality: c.quality }]} /></Card>
          </div>
          <div className="col gap16">
            <Card>
              <CardHead title="Execution route" />
              <div className="small text2">{ROUTE.name}</div>
              <div className="small muted mt4">{ROUTE.settlement}</div>
              <Banner tone="warn">{ROUTE.note}</Banner>
            </Card>
            <Card><CardHead title="Final risk check" right={<CheckVerdict checks={checks} />} /><ChecksList checks={checks} compact /></Card>
            <div className="row gap8"><Button onClick={() => setStep('build')}>Edit</Button><Button variant="gold" block size="lg" disabled={verdict === 'fail'} onClick={() => (s.txPrefs.reviewBeforeSign ? setSign(true) : doSign())}>Confirm and sign</Button></div>
          </div>
        </div>
      )}

      {step === 'track' && tracked && tx && (
        <div className="grid g-side">
          <div className="col gap16">
            <Card className="glow-gold">
              <CardHead title={`${strategy} ${sym} ${k}`} sub={`${qty} contract${qty > 1 ? 's' : ''} · expires ${fmtDate(expiry)}`} right={<TradeStatus stage={tx.stage} />} />
              <TxLanes tx={tx} />
              <div className="banner info mt16" style={{ marginTop: 16 }}><LuCircleCheck size={16} /><div>{tx.stage === 'confirmed' ? <><b>Done.</b> The position is open and counted in your portfolio.</> : tx.stage === 'failed' ? <><b>Nothing was filled.</b> No collateral moved. You can build the trade again.</> : tx.stage === 'unknown' ? <><b>Outcome unknown.</b> This is not a success and not a failure. The position is not counted as open and its collateral stays reserved.</> : <><b>Submitted is not completed.</b> The position only opens after execution and settlement are verified.</>}</div></div>
            </Card>
            <div className="row gap8 wrap"><Button variant="gold" onClick={() => go(`/app/portfolio/${tracked.posId}`)}>View position</Button><Button onClick={() => go('/app/activity')}>Open journal</Button><Button onClick={() => { setStep('build'); setTracked(null); }}>Build another</Button></div>
          </div>
          <Card><CardHead title="Summary" /><KV k="Total cost" v={usd(total)} /><KV k="Max loss" v={usd(total)} /><KV k="Break-even" v={usd(be)} /><KV k="Position ID" v={tracked.posId} /></Card>
        </div>
      )}

      <SignModal open={sign} onClose={() => setSign(false)} onSigned={() => { setSign(false); doSign(); }} action={`Open ${strategy.toLowerCase()} on ${sym}`} rows={[{ k: 'Contract', v: `${k} ${side} · ${fmtDate(expiry)}` }, { k: 'Quantity', v: String(qty) }, { k: 'Total premium', v: usd(total) }]} />
    </div>
  );

  function doSign() {
    const res = submitOpen({ sym, side, strike: k, expiry, qty, premium: ask ?? 0, source: 'manual' });
    setTracked({ hash: res.hash, posId: res.positionId });
    setStep('track');
  }
}
