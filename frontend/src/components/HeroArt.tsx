// Hero visual: product-UI glass cards floating over the peach panel.
// To use a real photo or render: drop it at public/hero.jpg (any size, ~1600px wide works well).
// It is picked up automatically and sits behind the cards. If the file is missing, the
// peach gradient shows instead. All figures on the cards are sample data.
import { LuCheck, LuMinus, LuTrendingUp } from 'react-icons/lu';

function Payoff() {
  // Long-call payoff: flat loss below strike, rising line above breakeven.
  return (
    <svg viewBox="0 0 220 88" className="hs-payoff" aria-hidden>
      <defs>
        <linearGradient id="hs-g" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#46d98b" stopOpacity=".35" />
          <stop offset="1" stopColor="#46d98b" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1="0" y1="56" x2="220" y2="56" stroke="rgba(255,255,255,.18)" strokeDasharray="3 4" />
      <path d="M0 66 L96 66 L196 8 L220 -6 L220 84 L0 84Z" fill="url(#hs-g)" opacity=".0" />
      <path d="M96 66 L196 8 L220 -6 L220 56 L132 56Z" fill="url(#hs-g)" />
      <path d="M0 66 L96 66 L220 -6" fill="none" stroke="#6ff0ab" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx="132" cy="56" r="4" fill="#0b0b0e" stroke="#fff" strokeWidth="2" />
      <text x="132" y="80" fill="rgba(255,255,255,.7)" fontSize="9" textAnchor="middle">Breakeven $934</text>
    </svg>
  );
}

export function HeroArt() {
  return (
    <div className="hero-stage">
      <div className="hero-photo" style={{ backgroundImage: 'url(/hero.jpg)' }} aria-hidden />
      <div className="hero-glow" aria-hidden />

      <div className="hs-card hs-main fx" style={{ ['--k' as string]: 8 }}>
        <div className="hs-row">
          <span className="hs-tag">Call · Jan 16</span>
          <span className="hs-est">Estimated price</span>
        </div>
        <div className="hs-title">NVDA $920</div>
        <div className="hs-price">$14.20 <small>per share</small></div>
        <Payoff />
        <div className="hs-stats">
          <div><span>Max loss</span><b>$1,420</b></div>
          <div><span>Breakeven</span><b>$934.20</b></div>
          <div><span>Delta</span><b>0.42</b></div>
        </div>
      </div>

      <div className="hs-card hs-ai fx" style={{ ['--k' as string]: 16 }}>
        <div className="hs-row">
          <span className="hs-tag gold">AI proposal</span>
          <span className="hs-est">Awaiting you</span>
        </div>
        <div className="hs-line"><LuTrendingUp size={15} /> Buy 1 NVDA call</div>
        <ul>
          <li><LuCheck size={13} /> Within position limit</li>
          <li><LuCheck size={13} /> Collateral covered</li>
          <li><LuCheck size={13} /> Price check passed</li>
        </ul>
        <div className="hs-btns"><span className="hs-b ghost">Reject</span><span className="hs-b">Approve</span></div>
      </div>

      <div className="hs-card hs-no fx" style={{ ['--k' as string]: 24 }}>
        <span className="hs-no-ic"><LuMinus size={14} /></span>
        <div><b>No trade on TSLA</b><span>Earnings in 2 days. Risk too high.</span></div>
      </div>

      <div className="hs-sample">Sample data</div>
    </div>
  );
}
