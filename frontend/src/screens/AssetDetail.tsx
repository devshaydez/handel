import { useState } from 'react';
import { LuStar, LuTrendingDown, LuTrendingUp, LuTriangleAlert } from 'react-icons/lu';
import { AreaChart } from '../components/charts';
import { Badge, Banner, Button, Card, CardHead, EmptyState, Growth, KV, PageHead, PageSkeleton, QualityBadge, Seg, Sparkle, Term, UnavailableState, useLoading } from '../components/ui';
import { assetBySym, EXPIRIES, dteOf, fmtDate, fmtStamp, fmtShort, isoAgo, MIN } from '../data/mock';
import { go } from '../router';
import { toggleWatch, useStore } from '../state/store';
import { usd } from '../lib/pricing';

export default function AssetDetail({ sym }: { sym: string }) {
  const s = useStore();
  const a = assetBySym(sym.toUpperCase());
  const [range, setRange] = useState<'30' | '60' | '90'>('90');
  const loading = useLoading(300);
  if (!a) return <div className="page"><EmptyState title={`${sym} is not supported`} body="Handel only lists assets with connected market data and execution." action={<Button onClick={() => go('/app/markets')}>Back to Markets</Button>} /></div>;
  if (loading) return <PageSkeleton />;
  const down = s.demo.feed === 'down';
  const stale = s.demo.feed === 'stale';
  const data = a.series.slice(-Number(range));
  const ch = (a.price / a.prevClose - 1) * 100;
  const ts = stale ? isoAgo(47 * MIN) : isoAgo(1 * MIN);
  const watched = s.watchlist.includes(a.sym);
  const labels = data.map((_, i) => `${data.length - 1 - i}d ago`);
  const verdict = a.signal === 'opportunity' ? { t: 'A setup exists', tone: 'gold' as const } : a.signal === 'no-trade' ? { t: 'No trade recommended', tone: 'outline' as const } : a.signal === 'watch' ? { t: 'Watching, not recommending', tone: 'blue' as const } : { t: 'Analysis only', tone: 'outline' as const };
  return (
    <div className="page">
      <PageHead
        crumbs={[{ label: 'Markets', href: '/app/markets' }, { label: a.sym }]}
        title={<span className="row gap12 wrap">{a.name} <span className="muted" style={{ fontSize: 18 }}>{a.sym}</span></span>}
        actions={<>
          <Button icon={<LuStar size={14} fill={watched ? 'currentColor' : 'none'} />} onClick={() => toggleWatch(a.sym)} aria-pressed={watched}>{watched ? 'Watching' : 'Add to watchlist'}</Button>
          <Button variant="gold" disabled={!a.optionsSupported} onClick={() => go(`/app/markets/${a.sym}/chain`)}>Explore options</Button>
        </>}
      />
      {!a.optionsSupported && <Banner tone="warn"><b>Options are not connected for {a.sym}.</b> You can read the analysis, but Handel can’t price, propose or execute contracts on it yet.</Banner>}
      {down && <Banner tone="danger"><b>Market data is unavailable.</b> Price and chart are hidden. The analysis below was written earlier and may be out of date.</Banner>}
      {stale && <Banner tone="warn"><b>Data is stale.</b> Last update was 47 minutes ago.</Banner>}
      <div className="grid g-main">
        <div className="col gap16">
          <Card>
            <div className="row between start wrap gap12">
              <div>
                <div className="hero-num">{down ? '—' : usd(a.price)}</div>
                <div className="row gap8 mt4">{!down && <Growth v={ch} />}<span className="tiny faint">Demo feed · {down ? 'no update' : fmtStamp(ts)}</span><QualityBadge q={down ? 'unavailable' : 'simulated'} /></div>
              </div>
              <Seg value={range} onChange={setRange} options={[{ v: '30', label: '30d' }, { v: '60', label: '60d' }, { v: '90', label: '90d' }]} />
            </div>
            <div className="mt16">{down ? <UnavailableState title="Chart unavailable" body="Historical prices can’t be loaded right now." /> : <AreaChart data={data} labels={labels} height={260} fmt={(v) => usd(v)} subLabels={[`${range} days ago`, 'Today']} />}</div>
          </Card>
          <div className="grid g3 g-stay2">
            <Card><div className="small muted"><Term k="iv">Implied volatility</Term></div><div className="big bold mt4">{(a.iv * 100).toFixed(1)}%</div></Card>
            <Card><div className="small muted">Realised vol (30d)</div><div className="big bold mt4">{(a.hv30 * 100).toFixed(1)}%</div></Card>
            <Card><div className="small muted"><Term k="ivrank">IV rank</Term></div><div className="big bold mt4">{a.ivRank}<span className="muted small"> / 100</span></div></Card>
          </div>
          <Card>
            <CardHead title="News and events" sub="Sample headlines, not real reporting" />
            {a.news.map((n, i) => (
              <div key={i} className="evidence">
                <span className="text2">{n.title}</span><span />
                <span className="src"><span>{n.source}</span><span>·</span><span>{fmtStamp(n.ts)}</span><QualityBadge q="simulated" /></span>
              </div>
            ))}
          </Card>
        </div>
        <div className="col gap16">
          <Card className="ai">
            <CardHead title={<><Sparkle />AI analysis</>} right={<Badge tone={verdict.tone}>{verdict.t}</Badge>} />
            <p className="text2">{a.summary}</p>
            <div className="col gap12 mt16">
              <div className="row gap12 start"><span className="tl-ic ok"><LuTrendingUp size={16} /></span><div><div className="semi">Bullish scenario</div><div className="small muted">{a.bull}</div></div></div>
              <div className="row gap12 start"><span className="tl-ic bad"><LuTrendingDown size={16} /></span><div><div className="semi">Bearish scenario</div><div className="small muted">{a.bear}</div></div></div>
              <div className="row gap12 start"><span className="tl-ic warn"><LuTriangleAlert size={16} /></span><div><div className="semi">Key risks</div><ul className="small muted" style={{ paddingLeft: 16, listStyle: 'disc' }}>{a.risks.map((r) => <li key={r}>{r}</li>)}</ul></div></div>
            </div>
            <div className="row gap8 wrap mt16"><Button size="sm" onClick={() => go('/app/assistant')} icon={<Sparkle />}>Ask about {a.sym}</Button>{a.optionsSupported && <Button size="sm" variant="gold" onClick={() => go(`/app/markets/${a.sym}/chain`)}>Explore options</Button>}</div>
          </Card>
          <Card>
            <CardHead title="Available expiries" />
            {a.optionsSupported ? <div className="col gap4">{EXPIRIES.map((e) => <button key={e} className="kv" onClick={() => go(`/app/markets/${a.sym}/chain?e=${e}`)}><span className="k">{fmtDate(e)}</span><span className="v">{dteOf(e)} days</span></button>)}</div> : <p className="small muted">None connected.</p>}
          </Card>
          <Card>
            <CardHead title="Details" />
            <KV k="Sector" v={a.sector} /><KV k="Previous close" v={usd(a.prevClose)} /><KV k="Options" v={a.optionsSupported ? 'Calls and puts' : 'Not connected'} />
          </Card>
        </div>
      </div>
    </div>
  );
}
