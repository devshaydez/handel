import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import {
  LuTriangleAlert, LuInfo, LuInbox, LuLock, LuWifiOff, LuScanSearch, LuX, LuArrowUpRight, LuChevronDown, LuMinus, LuPlus, LuCircleAlert,
} from 'react-icons/lu';
import { GLOSSARY } from '../data/mock';
import type { DataQuality } from '../data/types';
import { go } from '../router';

export type Tone = 'gold' | 'green' | 'red' | 'amber' | 'blue' | 'violet' | 'outline' | 'demo' | '';

export const Sparkle = ({ size = 14 }: { size?: number }) => (
  <span className="sparkle" aria-hidden>
    <LuScanSearch size={size} />
  </span>
);

export function Badge({ tone = '', sm, children, title }: { tone?: Tone; sm?: boolean; children: ReactNode; title?: string }) {
  return (
    <span className={`badge ${tone} ${sm ? 'sm' : ''}`} title={title}>
      {children}
    </span>
  );
}

export function Growth({ v, suffix = '%', dp = 1 }: { v: number; suffix?: string; dp?: number }) {
  const cls = Math.abs(v) < 0.05 ? 'flat' : v < 0 ? 'neg' : '';
  return (
    <span className={`growth ${cls}`}>
      {v > 0 ? '↑' : v < 0 ? '↓' : ''} {Math.abs(v).toFixed(dp)}
      {suffix}
    </span>
  );
}

export function Button({
  variant = 'soft', size, block, icon, children, ...rest
}: {
  variant?: 'gold' | 'white' | 'ghost' | 'soft' | 'danger';
  size?: 'sm' | 'lg';
  block?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...rest} className={`btn btn-${variant} ${size ? 'btn-' + size : ''} ${block ? 'btn-block' : ''} ${rest.className ?? ''}`}>
      {icon}
      {children}
    </button>
  );
}

export function Card({ children, className = '', style, onClick }: { children: ReactNode; className?: string; style?: CSSProperties; onClick?: () => void }) {
  return (
    <div className={`card ${className}`} style={style} onClick={onClick}>
      {children}
    </div>
  );
}
export function CardHead({ title, sub, right, icon }: { title: ReactNode; sub?: ReactNode; right?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="card-h">
      <div>
        <div className="card-t">
          {icon}
          {title}
        </div>
        {sub && <div className="card-s">{sub}</div>}
      </div>
      {right}
    </div>
  );
}

export function MCard({
  title, sub, tone, href, children, footer,
}: { title: ReactNode; sub?: ReactNode; tone?: 'neg' | 'gold' | 'plain'; href?: string; children?: ReactNode; footer?: ReactNode }) {
  return (
    <div className={`mcard ${tone ?? ''}`}>
      <div className="mcard-h">
        <div>
          <div className="mcard-t">{title}</div>
          {sub && <div className="mcard-s">{sub}</div>}
        </div>
        {href && (
          <button className="arrow-btn" onClick={() => go(href)} aria-label={`Open ${typeof title === 'string' ? title : 'details'}`}>
            <LuArrowUpRight size={14} />
          </button>
        )}
      </div>
      {children}
      {footer && <div className="mcard-f">{footer}</div>}
    </div>
  );
}
export const MStat = ({ label, value, sm }: { label: string; value: ReactNode; sm?: boolean }) => (
  <div className="mstat">
    <div className="l">{label}</div>
    <div className={`v ${sm ? 'sm' : ''}`}>{value}</div>
  </div>
);

export function Banner({ tone = 'info', children, action }: { tone?: 'info' | 'warn' | 'danger' | 'gold'; children: ReactNode; action?: ReactNode }) {
  const Icon = tone === 'danger' ? LuCircleAlert : tone === 'warn' ? LuTriangleAlert : LuInfo;
  return (
    <div className={`banner ${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon size={16} />
      <div className="grow">{children}</div>
      {action}
    </div>
  );
}

export function DemoTag() {
  return (
    <Badge tone="demo" sm title="All data in this prototype is mocked">
      Demo data
    </Badge>
  );
}

const Q_LABEL: Record<DataQuality | 'simulated', { tone: Tone; text: string; hint: string }> = {
  verified: { tone: 'green', text: 'Verified', hint: 'Quote from the verified (demo) oracle' },
  estimated: { tone: 'amber', text: 'Estimate', hint: 'Model estimate. Not a verified quote' },
  unavailable: { tone: 'outline', text: 'Unavailable', hint: 'No pricing evidence for this item' },
  simulated: { tone: 'violet', text: 'Simulated', hint: 'Simulated for this demo' },
};
export function QualityBadge({ q, sm = true }: { q: DataQuality | 'simulated'; sm?: boolean }) {
  const l = Q_LABEL[q];
  return (
    <Badge tone={l.tone} sm={sm} title={l.hint}>
      {l.text}
    </Badge>
  );
}

export function SymBadge({ sym }: { sym: string }) {
  return <div className="sym-badge">{sym.slice(0, 4)}</div>;
}

// ── states ───────────────────────────────────────────────────
export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="state">
      <div className="ico">{icon ?? <LuInbox size={22} />}</div>
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}
export function ErrorState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="state danger" role="alert">
      <div className="ico">
        <LuCircleAlert size={22} />
      </div>
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}
export function RestrictedState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="state warn">
      <div className="ico">
        <LuLock size={22} />
      </div>
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}
export function UnavailableState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="state">
      <div className="ico">
        <LuWifiOff size={22} />
      </div>
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}

export const Skeleton = ({ h = 16, w = '100%', r }: { h?: number; w?: number | string; r?: number }) => (
  <div className="skeleton" style={{ height: h, width: w, borderRadius: r }} />
);
export function PageSkeleton() {
  return (
    <div className="page" aria-busy="true" aria-label="Loading">
      <Skeleton h={34} w={260} />
      <div className="grid g4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} h={130} r={22} />
        ))}
      </div>
      <div className="grid g-main">
        <Skeleton h={320} r={22} />
        <Skeleton h={320} r={22} />
      </div>
    </div>
  );
}
export function useLoading(ms = 380) {
  const [l, setL] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setL(false), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return l;
}

// ── overlays ─────────────────────────────────────────────────
export function Modal({ open, onClose, title, children, wide, className = '' }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean; className?: string }) {
  useEffect(() => {
    if (!open) return;
    const f = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''} ${className}`} role="dialog" aria-modal="true">
        <div className="modal-h">
          <h3>{title}</h3>
          <button className="btn btn-soft btn-icon" onClick={onClose} aria-label="Close">
            <LuX size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Term({ k, children }: { k: string; children?: ReactNode }) {
  const g = GLOSSARY[k];
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number; below: boolean } | null>(null);
  if (!g) return <>{children}</>;
  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const x = Math.min(Math.max(r.left + r.width / 2 - 140, 10), window.innerWidth - 290);
    const below = r.top < 150;
    setPos({ x, y: below ? r.bottom + 8 : r.top - 8, below });
  };
  return (
    <>
      <span
        ref={ref}
        className="term"
        tabIndex={0}
        onMouseEnter={show}
        onMouseLeave={() => setPos(null)}
        onFocus={show}
        onBlur={() => setPos(null)}
        onClick={(e) => { e.stopPropagation(); pos ? setPos(null) : show(); }}
      >
        {children ?? g.title}
      </span>
      {pos && createPortal(
        <span className="term-pop" style={{ left: pos.x, top: pos.y, transform: pos.below ? 'none' : 'translateY(-100%)' }} role="tooltip">
          <b>{g.title}</b>
          {g.body}
        </span>,
        document.body,
      )}
    </>
  );
}

export function Accordion({ title, children, defaultOpen }: { title: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [o, setO] = useState(!!defaultOpen);
  return (
    <div className="accordion">
      <button className="h" onClick={() => setO(!o)} aria-expanded={o}>
        <span>{title}</span>
        <LuChevronDown size={16} style={{ transform: o ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
      </button>
      {o && <div className="b">{children}</div>}
    </div>
  );
}

export function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { v: T; label: ReactNode }[] }) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button key={o.v} className={value === o.v ? 'on' : ''} onClick={() => onChange(o.v)} role="tab" aria-selected={value === o.v}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <button className={`switch ${on ? 'on' : ''}`} role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)} />;
}

export function QtyStepper({ value, onChange, min = 1, max = 20 }: { value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  return (
    <div className="qty">
      <button onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="Decrease quantity">
        <LuMinus size={14} />
      </button>
      <span>{value}</span>
      <button onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="Increase quantity">
        <LuPlus size={14} />
      </button>
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { v: T; label: string; n?: number }[] }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.v} className={value === t.v ? 'on' : ''} onClick={() => onChange(t.v)} role="tab" aria-selected={value === t.v}>
          {t.label}
          {t.n != null && <span className="n">{t.n}</span>}
        </button>
      ))}
    </div>
  );
}

export function PageHead({ title, sub, crumbs, actions }: { title: ReactNode; sub?: ReactNode; crumbs?: { label: string; href?: string }[]; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        {crumbs && (
          <div className="crumbs">
            {crumbs.map((c, i) => (
              <span key={i} className="row gap6">
                {c.href ? <a href={'#' + c.href} onClick={(e) => { e.preventDefault(); go(c.href!); }}>{c.label}</a> : <span>{c.label}</span>}
                {i < crumbs.length - 1 && <span>/</span>}
              </span>
            ))}
          </div>
        )}
        <h1>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {actions && <div className="row gap8 wrap">{actions}</div>}
    </div>
  );
}

export function KV({ k, v }: { k: ReactNode; v: ReactNode }) {
  return (
    <div className="kv">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
}

export function useClickOutside(ref: React.RefObject<HTMLElement | null>, fn: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const f = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && fn();
    document.addEventListener('mousedown', f);
    return () => document.removeEventListener('mousedown', f);
  }, [ref, fn, active]);
}

export function useTick(ms = 1000) {
  const [, set] = useState(0);
  useLayoutEffect(() => {
    const t = setInterval(() => set((x) => x + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}
