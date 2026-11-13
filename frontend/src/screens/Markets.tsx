import { useState } from 'react';
import { LuSearch, LuStar } from 'react-icons/lu';
import { Sparkline } from '../components/charts';
import { Badge, Banner, Button, Card, EmptyState, Growth, PageHead, PageSkeleton, SymBadge, Tabs, Term, UnavailableState, useLoading } from '../components/ui';
import { ASSETS } from '../data/mock';
import { useRoute, go } from '../router';
import { toggleWatch, useStore } from '../state/store';
import { usd } from '../lib/pricing';

const SIG = { opportunity: { t: 'AI setup', tone: 'gold' as const }, watch: { t: 'Watching', tone: 'blue' as const }, 'no-trade': { t: 'No trade', tone: 'outline' as const }, none: { t: 'Analysis only', tone: 'outline' as const } };

export default function Markets() {
  const s = useStore();
  const r = useRoute();
  const [q, setQ] = useState(r.query.get('q') ?? '');
  const [tab, setTab] = useState<'all' | 'watch' | 'opp'>('all');
  const loading = useLoading(300);
  if (loading) return <PageSkeleton />;
  const down = s.demo.feed === 'down';
  const list = ASSETS.filter((a) => (a.sym + a.name).toLowerCase().includes(q.toLowerCase()))
    .filter((a) => (tab === 'watch' ? s.watchlist.includes(a.sym) : tab === 'opp' ? a.signal === 'opportunity' : true));
  return (
    <div className="page">
      <PageHead title="Markets" sub="Supported underlyings with options available through Handel. Prices are demo data." />
      {down && <Banner tone="danger"><b>Market data is unavailable.</b> Prices and movement are hidden. You can still read saved analysis.</Banner>}
      {s.demo.feed === 'stale' && <Banner tone="warn"><b>Prices are 47 minutes old.</b> Treat them as estimates.</Banner>}
      <div className="row between wrap gap12">
        <Tabs value={tab} onChange={setTab} tabs={[{ v: 'all', label: 'All assets', n: ASSETS.length }, { v: 'watch', label: 'Watchlist', n: s.watchlist.length }, { v: 'opp', label: 'AI opportunities', n: ASSETS.filter((a) => a.signal === 'opportunity').length }]} />
        <div className="topbar" style={{ position: 'static', padding: 0, background: 'none', border: 0, backdropFilter: 'none' }}>
          <div className="search" style={{ position: 'relative', width: 280 }}>
            <LuSearch size={15} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
            <input className="input" style={{ borderRadius: 99, paddingLeft: 36 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search symbol or name" aria-label="Search markets" />
          </div>
        </div>
      </div>
      <Card className="flush">
        {list.length === 0 ? (
          <EmptyState title={q ? `No assets match “${q}”` : tab === 'watch' ? 'Your watchlist is empty' : 'No setups right now'} body={q ? 'Only assets supported by Handel’s market-data and execution integrations are listed.' : tab === 'watch' ? 'Tap the star on any asset to follow it.' : 'The AI is not recommending any trade at the moment. That is a valid result.'} action={q ? <Button onClick={() => setQ('')}>Clear search</Button> : undefined} />
        ) : down ? (
          <UnavailableState title="Prices unavailable" body="The market-data integration is not responding. Try again shortly, or switch the feed back in Demo controls." />
        ) : (
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th style={{ width: 40 }} /><th>Asset</th><th className="r">Price</th><th className="r">Day</th><th className="hide-m">Trend (90d)</th><th className="r hide-m"><Term k="ivrank">IV rank</Term></th><th>AI view</th></tr></thead><tbody>
            {list.map((a) => {
              const ch = (a.price / a.prevClose - 1) * 100;
              const on = s.watchlist.includes(a.sym);
              const sig = SIG[a.signal];
              return (
                <tr key={a.sym} className="click" onClick={() => go(`/app/markets/${a.sym}`)}>
                  <td onClick={(e) => e.stopPropagation()}><button className="btn btn-soft btn-icon" style={{ width: 30, height: 30 }} onClick={() => toggleWatch(a.sym)} aria-label={on ? `Remove ${a.sym} from watchlist` : `Add ${a.sym} to watchlist`} aria-pressed={on}><LuStar size={14} className={on ? 'gold' : 'muted'} fill={on ? 'currentColor' : 'none'} /></button></td>
                  <td><div className="row gap12"><SymBadge sym={a.sym} /><div><div className="semi">{a.sym}</div><div className="tiny muted">{a.name}</div></div></div></td>
                  <td className="r num semi">{usd(a.price)}</td>
                  <td className="r"><Growth v={ch} /></td>
                  <td className="hide-m"><Sparkline data={a.series.slice(-45)} w={110} /></td>
                  <td className="r num hide-m">{a.ivRank}</td>
                  <td><div className="col gap4" style={{ alignItems: 'flex-start' }}><Badge tone={sig.tone} sm>{sig.t}</Badge>{!a.optionsSupported && <span className="tiny faint">Options not connected</span>}</div></td>
                </tr>
              );
            })}
          </tbody></table></div>
        )}
      </Card>
      <p className="tiny faint">Sample news and prices are simulated. Only assets with connected market data and execution are listed as tradable.</p>
    </div>
  );
}
