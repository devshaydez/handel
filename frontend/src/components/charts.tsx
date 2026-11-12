import { useRef, useState, type ReactNode } from 'react';
import { CONTRACT_SIZE, payoffAtExpiry, breakeven, usd0 } from '../lib/pricing';
import type { Side } from '../data/types';

// ── Area chart with dotted texture (tests-visualised reference) ──
export function AreaChart({
  data, labels, height = 220, color = '#f6f3ec', fmt = (v: number) => v.toFixed(2), dotted = true, yPad = 0.08, subLabels,
}: { data: number[]; labels?: string[]; height?: number; color?: string; fmt?: (v: number) => string; dotted?: boolean; yPad?: number; subLabels?: [string, string] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hi, setHi] = useState<number | null>(null);
  const W = 1000;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const lo = min - span * yPad;
  const hiV = max + span * yPad;
  const X = (i: number) => (i / (data.length - 1)) * 100;
  const Y = (v: number) => 100 - ((v - lo) / (hiV - lo)) * 100;
  const pts = data.map((v, i) => `${(X(i) * W) / 100},${(Y(v) * height) / 100}`);
  const line = 'M' + pts.join(' L');
  const clip = `polygon(0% 100%, ${data.map((v, i) => `${X(i)}% ${Y(v)}%`).join(', ')}, 100% 100%)`;
  const onMove = (e: React.MouseEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const f = Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1);
    setHi(Math.round(f * (data.length - 1)));
  };
  return (
    <div className="chart">
      <div ref={ref} style={{ position: 'relative', height }} onMouseMove={onMove} onMouseLeave={() => setHi(null)}>
        {dotted && (
          <div
            style={{
              position: 'absolute', inset: 0, clipPath: clip, opacity: 0.55,
              backgroundImage: `radial-gradient(${color}88 1px, transparent 1.2px)`, backgroundSize: '5px 5px',
              WebkitMaskImage: 'linear-gradient(180deg, #000, transparent 90%)', maskImage: 'linear-gradient(180deg, #000, transparent 90%)',
            }}
          />
        )}
        <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, height }}>
          <path d={line} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          {hi != null && <line x1={(X(hi) * W) / 100} x2={(X(hi) * W) / 100} y1={0} y2={height} stroke="rgba(255,255,255,.25)" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
        </svg>
        {hi != null && (
          <>
            <span style={{ position: 'absolute', left: `${X(hi)}%`, top: `${Y(data[hi])}%`, width: 10, height: 10, borderRadius: 99, background: color, transform: 'translate(-50%,-50%)', boxShadow: '0 0 0 4px rgba(255,255,255,.12)' }} />
            <span className="chart-tip" style={{ left: `${Math.min(Math.max(X(hi), 8), 92)}%`, top: `${Math.max(Y(data[hi]), 12)}%`, marginTop: -12 }}>
              {fmt(data[hi])}
              {labels && <span style={{ fontWeight: 500, opacity: 0.6 }}> · {labels[hi]}</span>}
            </span>
          </>
        )}
      </div>
      {subLabels && (
        <div className="chart-axis">
          <span>{subLabels[0]}</span>
          <span>{subLabels[1]}</span>
        </div>
      )}
    </div>
  );
}

// ── Lollipop chart (reach reference) ──
export function Lollipop({ data, labels, height = 150, fmt = (v: number) => String(v), colorFor }: { data: number[]; labels?: string[]; height?: number; fmt?: (v: number) => string; colorFor?: (v: number) => string }) {
  const [hi, setHi] = useState<number | null>(null);
  const max = Math.max(...data.map(Math.abs)) || 1;
  return (
    <div className="chart" style={{ height }} onMouseLeave={() => setHi(null)}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: '100%', position: 'relative' }}>
        {data.map((v, i) => {
          const h = Math.max((Math.abs(v) / max) * 88, 4);
          const on = hi === i;
          const c = colorFor ? colorFor(v) : '#cfcabd';
          return (
            <div key={i} onMouseEnter={() => setHi(i)} style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', position: 'relative', cursor: 'crosshair' }}>
              <div style={{ width: 1.5, height: `${h}%`, background: on ? '#fff' : c, opacity: on ? 1 : 0.5, position: 'relative' }}>
                <span style={{ position: 'absolute', top: -3, left: '50%', width: on ? 8 : 5, height: on ? 8 : 5, borderRadius: 99, background: on ? '#fff' : c, transform: 'translate(-50%,0)' }} />
                {on && (
                  <span className="chart-tip" style={{ left: '50%', top: -10 }}>
                    {fmt(v)}
                    {labels && <span style={{ fontWeight: 500, opacity: 0.6 }}> · {labels[i]}</span>}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Bars with highlighted bar (revenue reference) ──
export function Bars({ data, height = 150, fmt = (v: number) => String(v), selected, onSelect }: { data: { label: string; value: number }[]; height?: number; fmt?: (v: number) => string; selected?: number; onSelect?: (i: number) => void }) {
  const [hov, setHov] = useState<number | null>(null);
  const active = hov ?? selected ?? data.length - 1;
  const max = Math.max(...data.map((d) => d.value), 0);
  const min = Math.min(...data.map((d) => d.value), 0);
  const span = max - min || 1;
  const zero = (max / span) * 100; // % from top
  return (
    <div className="chart">
      <div style={{ position: 'relative', height, display: 'flex', gap: 6 }} onMouseLeave={() => setHov(null)}>
        {data.map((d, i) => {
          const h = (Math.abs(d.value) / span) * 100;
          const top = d.value >= 0 ? zero - h : zero;
          const on = i === active;
          return (
            <div key={i} style={{ flex: 1, position: 'relative', cursor: 'pointer' }} onMouseEnter={() => setHov(i)} onClick={() => onSelect?.(i)}>
              <div
                style={{
                  position: 'absolute', left: 0, right: 0, top: `${top}%`, height: `${Math.max(h, 2)}%`, borderRadius: 7,
                  background: on ? (d.value < 0 ? 'var(--red)' : '#fff') : d.value < 0 ? 'rgba(255,106,95,.25)' : 'rgba(255,255,255,.1)',
                  transition: 'background .15s',
                }}
              />
              {on && (
                <span className="chart-tip" style={{ left: '50%', top: `${Math.max(top - 4, 8)}%`, background: d.value < 0 ? 'var(--red)' : '#fff', color: d.value < 0 ? '#fff' : '#0b0b0e' }}>
                  {fmt(d.value)}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        {data.map((d, i) => (
          <span key={i} style={{ flex: 1, textAlign: 'center', fontSize: 10.5, color: i === active ? '#fff' : 'var(--faint)', fontWeight: 700 }}>
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Radial tick donut (traffic reference) ──
const TONES = ['#ffd98a', '#f6f3ec', '#b7b1a2', '#7d7869', '#53504a', '#3a3834'];
export function TickDonut({ data, size = 190, centerLabel, centerValue }: { data: { label: string; value: number }[]; size?: number; centerLabel: string; centerValue: ReactNode }) {
  const total = data.reduce((a, d) => a + d.value, 0) || 1;
  const [hi, setHi] = useState<number | null>(null);
  const N = 84;
  const ticks: { i: number; seg: number }[] = [];
  let acc = 0;
  const bounds = data.map((d) => (acc += d.value / total));
  for (let i = 0; i < N; i++) {
    const f = (i + 0.5) / N;
    const seg = bounds.findIndex((b) => f <= b);
    ticks.push({ i, seg: seg < 0 ? data.length - 1 : seg });
  }
  const r1 = size / 2 - 2;
  const r0 = size / 2 - 26;
  return (
    <div className="col gap16" style={{ alignItems: 'center' }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {ticks.map(({ i, seg }) => {
            const a = (i / N) * Math.PI * 2 - Math.PI / 2;
            const long = hi === seg;
            const rr0 = long ? r0 - 3 : r0 + 3 * ((i * 7) % 4 === 0 ? 0 : 1);
            return (
              <line
                key={i}
                x1={size / 2 + Math.cos(a) * rr0}
                y1={size / 2 + Math.sin(a) * rr0}
                x2={size / 2 + Math.cos(a) * r1}
                y2={size / 2 + Math.sin(a) * r1}
                stroke={TONES[seg % TONES.length]}
                strokeWidth={2.2}
                strokeLinecap="round"
                opacity={hi == null || hi === seg ? 1 : 0.25}
              />
            );
          })}
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
          <div>
            <div style={{ fontSize: 10, color: 'var(--faint)', letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 600 }}>{centerLabel}</div>
            <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-.02em' }}>{centerValue}</div>
          </div>
        </div>
      </div>
      <div className="legend" style={{ width: '100%' }}>
        {data.map((d, i) => (
          <div key={d.label} className="it" onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi(null)}>
            <span className="dot" style={{ color: TONES[i % TONES.length], width: 6, height: 6 }} />
            {d.label}
            <b>{Math.round((d.value / total) * 100)}%</b>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Sparkline({ data, w = 90, h = 30, up }: { data: number[]; w?: number; h?: number; up?: boolean }) {
  const min = Math.min(...data), max = Math.max(...data);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - 2 - ((v - min) / (max - min || 1)) * (h - 4)}`).join(' ');
  const c = up ?? data[data.length - 1] >= data[0] ? '#46d98b' : '#ff6a5f';
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <polyline points={pts} fill="none" stroke={c} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ── Payoff at expiry ──
export function PayoffChart({ side, strike, premium, spot, qty, height = 230 }: { side: Side; strike: number; premium: number; spot: number; qty: number; height?: number }) {
  const be = breakeven(side, strike, premium);
  const lo = Math.min(spot, strike, be) * 0.86;
  const hi = Math.max(spot, strike, be) * 1.14;
  const N = 80;
  const xs = Array.from({ length: N + 1 }, (_, i) => lo + ((hi - lo) * i) / N);
  const ys = xs.map((x) => payoffAtExpiry(side, strike, x, premium) * qty);
  const maxY = Math.max(...ys, premium * CONTRACT_SIZE * qty * 0.5);
  const minY = Math.min(...ys);
  const span = maxY - minY || 1;
  const W = 1000;
  const X = (x: number) => ((x - lo) / (hi - lo)) * 100;
  const Y = (y: number) => 100 - ((y - minY) / span) * 100;
  const zeroY = Y(0);
  const path = (f: (y: number) => number) => 'M' + xs.map((x, i) => `${(X(x) * W) / 100},${(Y(f(ys[i])) * height) / 100}`).join(' L');
  const area = (f: (y: number) => number) =>
    `M${(X(xs[0]) * W) / 100},${(zeroY * height) / 100} ` + xs.map((x, i) => `L${(X(x) * W) / 100},${(Y(f(ys[i])) * height) / 100}`).join(' ') + ` L${(X(xs[N]) * W) / 100},${(zeroY * height) / 100} Z`;
  const mark = (x: number, label: string, tone: string, down?: boolean) => (
    <div key={label} style={{ position: 'absolute', left: `${X(x)}%`, top: 0, bottom: 0, width: 0, borderLeft: `1px dashed ${tone}`, opacity: 0.8 }}>
      <span style={{ position: 'absolute', [down ? 'bottom' : 'top']: -2, left: 6, fontSize: 10.5, fontWeight: 700, color: tone, whiteSpace: 'nowrap', background: 'var(--panel)', padding: '0 4px', borderRadius: 4 }}>{label}</span>
    </div>
  );
  return (
    <div className="chart" role="img" aria-label={`Payoff at expiry. Break-even ${usd0(be)}. Maximum loss ${usd0(premium * CONTRACT_SIZE * qty)}.`}>
      <div style={{ position: 'relative', height, marginTop: 18 }}>
        <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, height }}>
          <defs>
            <linearGradient id="pg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#46d98b" stopOpacity=".35" /><stop offset="1" stopColor="#46d98b" stopOpacity="0" /></linearGradient>
            <linearGradient id="pr" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#ff6a5f" stopOpacity=".35" /><stop offset="1" stopColor="#ff6a5f" stopOpacity="0" /></linearGradient>
          </defs>
          <path d={area((y) => Math.max(y, 0))} fill="url(#pg)" />
          <path d={area((y) => Math.min(y, 0))} fill="url(#pr)" />
          <line x1={0} x2={W} y1={(zeroY * height) / 100} y2={(zeroY * height) / 100} stroke="rgba(255,255,255,.22)" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
          <path d={path((y) => y)} fill="none" stroke="#f6f3ec" strokeWidth={2.2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </svg>
        {mark(spot, `Now ${usd0(spot)}`, '#f2b24a')}
        {mark(be, `Break-even ${usd0(be)}`, '#46d98b', true)}
      </div>
      <div className="chart-axis">
        <span>{usd0(lo)}</span>
        <span>Price at expiry</span>
        <span>{usd0(hi)}</span>
      </div>
    </div>
  );
}
