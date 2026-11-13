import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  LuLayoutDashboard, LuTrendingUp, LuBriefcase, LuMessageSquareText, LuSlidersHorizontal, LuHistory, LuSettings, LuBell, LuSearch,
  LuWallet, LuEllipsis, LuCircleCheck, LuTriangleAlert, LuCircleAlert, LuInfo, LuX, LuLock,
} from 'react-icons/lu';
import { fmtStamp, NETWORK } from '../data/mock';
import { go, type Route } from '../router';
import {
  dismissToast, hydrateAgentMode, markAllRead, markRead, useStore, agentStatus,
} from '../state/store';
import { AgentPill } from './status';
import { getOnChainAgentExecutionMode, getOnChainAgentPolicy } from '../lib/near-wallet';
import { Logo } from './Logo';
import { Badge, Button, Modal, useClickOutside } from './ui';

const NAV = [
  { href: '/app', label: 'Dashboard', icon: LuLayoutDashboard, match: (p: string) => p === '/app' },
  { href: '/app/markets', label: 'Markets', icon: LuTrendingUp, match: (p: string) => p.startsWith('/app/markets') || p.startsWith('/app/trade') },
  { href: '/app/portfolio', label: 'Portfolio', icon: LuBriefcase, match: (p: string) => p.startsWith('/app/portfolio') },
  { href: '/app/assistant', label: 'Assistant', icon: LuMessageSquareText, match: (p: string) => p.startsWith('/app/assistant') },
  { href: '/app/agent', label: 'Agent', icon: LuSlidersHorizontal, match: (p: string) => p.startsWith('/app/agent') },
  { href: '/app/activity', label: 'Activity', icon: LuHistory, match: (p: string) => p.startsWith('/app/activity') },
  { href: '/app/settings', label: 'Settings', icon: LuSettings, match: (p: string) => p.startsWith('/app/settings') },
];

export function Brand({ onClick }: { onClick?: () => void }) {
  return (
    <div className="brand" onClick={onClick ?? (() => go('/'))} role="link" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && go('/')}>
      <Logo size={30} />
      Handel
    </div>
  );
}

function Notifications() {
  const s = useStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);
  const unread = s.notices.filter((n) => !n.read).length;
  const Ico = (t: string) => (t === 'danger' ? LuCircleAlert : t === 'warn' ? LuTriangleAlert : t === 'success' ? LuCircleCheck : LuInfo);
  const col = (t: string) => (t === 'danger' ? 'var(--red)' : t === 'warn' ? 'var(--amber)' : t === 'success' ? 'var(--green)' : 'var(--blue)');
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="btn btn-soft btn-icon" onClick={() => setOpen(!open)} aria-label={`Notifications, ${unread} unread`} aria-expanded={open}>
        <LuBell size={17} />
        {unread > 0 && <span className="ping" />}
      </button>
      {open && (
        <div className="pop notif-pop">
          <div className="row between" style={{ padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
            <b>Notifications</b>
            <button className="link small" onClick={markAllRead}>Mark all read</button>
          </div>
          {s.notices.length === 0 && <div className="state" style={{ padding: 30 }}><p>You’re all caught up. Alerts about proposals, transactions and expiry appear here.</p></div>}
          {s.notices.map((n) => {
            const I = Ico(n.tone);
            return (
              <button key={n.id} className={`notif ${n.read ? '' : 'unread'}`} onClick={() => { markRead(n.id); setOpen(false); if (n.href) go(n.href); }}>
                <I size={16} style={{ color: col(n.tone), flex: 'none', marginTop: 2 }} />
                <div className="grow">
                  <div className="semi">{n.title}</div>
                  <div className="small muted">{n.body}</div>
                  <div className="tiny faint mt4">{fmtStamp(n.ts)}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function WalletChip() {
  const s = useStore();
  if (s.wallet.connected)
    return (
      <button className="btn btn-soft wallet-chip" onClick={() => go('/app/settings')} title={`${s.wallet.account} on ${NETWORK}`}>
        <span className="dot" style={{ color: 'var(--green)', width: 7, height: 7 }} />
        <span className="txt mono">{s.wallet.account}</span>
        <LuWallet size={15} className="muted" />
      </button>
    );
  return (
    <Button variant="gold" size="sm" icon={<LuWallet size={14} />} onClick={() => go('/connect')}>
      {s.wallet.readOnly ? 'Connect wallet' : 'Connect'}
    </Button>
  );
}

export function Shell({ route, children }: { route: Route; children: ReactNode }) {
  const s = useStore();
  useEffect(() => {
    let active = true;
    Promise.all([getOnChainAgentPolicy(), getOnChainAgentExecutionMode()]).then(([policy, executionMode]) => {
      if (!active) return;
      const delegated = policy?.enabled === true && executionMode === 'Delegated';
      hydrateAgentMode(delegated ? 'auto' : executionMode === 'Advisory' || executionMode === 'Education' ? 'advisory' : 'approval', policy?.enabled === false);
    }).catch(() => {
      // Keep the safe non-delegated display if public chain reads are unavailable.
    });
    return () => { active = false; };
  }, []);
  const [more, setMore] = useState(false);
  const [q, setQ] = useState('');
  const pending = s.proposals.filter((p) => p.status === 'pending').length;
  const st = agentStatus(s);
  void st;
  const mobileNav = NAV.filter((n) => ['/app', '/app/markets', '/app/portfolio', '/app/assistant'].includes(n.href));
  const moreNav = NAV.filter((n) => !mobileNav.includes(n));
  return (
    <div className="app">
      <div className="ambient" aria-hidden><i /><i /><i /></div>
      <aside className="sidebar">
        <Brand />
        <nav className="nav" aria-label="Main">
          {NAV.map((n) => (
            <a key={n.href} href={'#' + n.href} onClick={(e) => { e.preventDefault(); go(n.href); }} className={`nav-item ${n.match(route.path) ? 'on' : ''}`} aria-current={n.match(route.path) ? 'page' : undefined}>
              <n.icon size={18} />
              {n.label}
              {n.count && pending > 0 && <span className="count">{pending}</span>}
            </a>
          ))}
        </nav>
        <div className="nav-foot">
          <div className="card" style={{ padding: 14, borderRadius: 16 }}>
            <div className="row gap8"><Badge tone="outline">Testnet prototype</Badge></div>
            <div className="tiny muted mt8">{NETWORK}. Test-token contract actions only; live market pricing is not connected.</div>
          </div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="hide-desktop" style={{ display: 'contents' }}>
            <span className="brand-mark show-m" style={{ display: 'none' }} />
          </div>
          <form className="search" onSubmit={(e) => { e.preventDefault(); go(`/app/markets?q=${encodeURIComponent(q)}`); }} role="search">
            <LuSearch size={15} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search assets, e.g. NVDA" aria-label="Search assets" />
          </form>
          <div className="grow" />
          <AgentPill />
          <Notifications />
          <WalletChip />
        </header>
        {s.wallet.readOnly && !s.wallet.connected && (
          <div style={{ padding: '12px 28px 0' }}>
            <div className="banner warn"><LuLock size={16} /><div><b>Read-only mode.</b> You can explore everything, but signing a trade needs a connected wallet.</div><Button size="sm" variant="gold" onClick={() => go('/connect')}>Connect wallet</Button></div>
          </div>
        )}
        {children}
      </div>
      <nav className="bottom-nav" aria-label="Main">
        {mobileNav.map((n) => (
          <button key={n.href} className={n.match(route.path) ? 'on' : ''} onClick={() => go(n.href)}>
            <n.icon size={20} />
            {n.label}
          </button>
        ))}
        <button className={moreNav.some((n) => n.match(route.path)) ? 'on' : ''} onClick={() => setMore(true)}>
          <LuEllipsis size={20} />
          More
          {pending > 0 && <span className="count">{pending}</span>}
        </button>
      </nav>
      <Modal open={more} onClose={() => setMore(false)} title="More">
        <div className="col gap8">
          {moreNav.map((n) => (
            <button key={n.href} className="list-item" onClick={() => { setMore(false); go(n.href); }}>
              <n.icon size={18} />
              <span className="semi grow">{n.label}</span>
              {n.count && pending > 0 && <Badge tone="gold">{pending}</Badge>}
            </button>
          ))}
        </div>
      </Modal>
      <Toasts />
    </div>
  );
}

export function Toasts() {
  const s = useStore();
  return (
    <div className="toasts" aria-live="polite">
      {s.toasts.map((t) => {
        const I = t.tone === 'danger' ? LuCircleAlert : t.tone === 'warn' ? LuTriangleAlert : t.tone === 'success' ? LuCircleCheck : LuInfo;
        return (
          <div key={t.id} className={`toast ${t.tone}`} role="status">
            <I size={17} style={{ flex: 'none', marginTop: 1 }} />
            <span className="grow">{t.text}</span>
            <button onClick={() => dismissToast(t.id)} aria-label="Dismiss"><LuX size={14} className="muted" /></button>
          </div>
        );
      })}
    </div>
  );
}
