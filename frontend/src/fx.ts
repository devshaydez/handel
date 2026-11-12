// Motion layer: scroll reveals, pointer spotlight, click ripples, hero parallax and scroll vars.
// Everything is progressive. Content is visible at rest and the effects only add polish.
const REVEAL = '.lp-sec h2,.lp-sec .lead,.lp-step,.lp-mode,.lp-layer,.lp-prev > *,.lp-cta,.lp-foot,.lp-trust';
const SPOT = '.card,.mcard,.list-item,.radio-card,.lp-step,.lp-mode,.lp-layer,.tl-item';

export function initFx() {
  const root = document.documentElement;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // scroll reveal
  const io =
    'IntersectionObserver' in window && !reduce
      ? new IntersectionObserver(
          (es) =>
            es.forEach((e) => {
              if (!e.isIntersecting) return;
              const el = e.target as HTMLElement;
              el.classList.add('in');
              io!.unobserve(el);
              setTimeout(() => { el.style.transitionDelay = ''; }, 1400);
            }),
          { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
        )
      : null;
  let scanQueued = false;
  const scan = () => {
    scanQueued = false;
    document.querySelectorAll<HTMLElement>(REVEAL).forEach((el) => {
      if (el.dataset.rv) return;
      el.dataset.rv = '1';
      if (!io) return;
      el.classList.add('rv');
      const idx = Array.from(el.parentElement?.children ?? []).indexOf(el);
      el.style.transitionDelay = `${Math.min(idx, 6) * 80}ms`;
      io.observe(el);
    });
  };
  scan();
  const mo = new MutationObserver(() => {
    if (scanQueued) return;
    scanQueued = true;
    requestAnimationFrame(scan);
  });
  mo.observe(document.body, { childList: true, subtree: true });

  // pointer: spotlight on cards, hero parallax
  const onMove = (e: PointerEvent) => {
    const t = (e.target as HTMLElement | null)?.closest?.(SPOT) as HTMLElement | null;
    if (t) {
      const r = t.getBoundingClientRect();
      t.style.setProperty('--mx', `${e.clientX - r.left}px`);
      t.style.setProperty('--my', `${e.clientY - r.top}px`);
    }
    if (reduce) return;
    const art = document.querySelector<HTMLElement>('.lp-art');
    if (art) {
      art.style.setProperty('--px', String(((e.clientX / window.innerWidth) - 0.5) * 2));
      art.style.setProperty('--py', String(((e.clientY / window.innerHeight) - 0.5) * 2));
    }
  };
  document.addEventListener('pointermove', onMove, { passive: true });

  // click ripple
  const onDown = (e: PointerEvent) => {
    if (reduce) return;
    const b = (e.target as HTMLElement | null)?.closest?.('.btn,.chip') as HTMLElement | null;
    if (!b || (b as HTMLButtonElement).disabled) return;
    const r = b.getBoundingClientRect();
    const d = Math.max(r.width, r.height) * 2;
    const s = document.createElement('span');
    s.className = 'ripple';
    s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
    b.appendChild(s);
    setTimeout(() => s.remove(), 700);
  };
  document.addEventListener('pointerdown', onDown, { passive: true });

  // scroll vars
  let tick = false;
  const onScroll = () => {
    if (tick) return;
    tick = true;
    requestAnimationFrame(() => {
      const y = window.scrollY;
      const max = root.scrollHeight - window.innerHeight;
      root.style.setProperty('--sy', String(y));
      root.style.setProperty('--sp', String(max > 0 ? Math.min(y / max, 1) : 0));
      root.dataset.scrolled = y > 8 ? '1' : '0';
      tick = false;
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  onScroll();

  return () => {
    io?.disconnect();
    mo.disconnect();
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerdown', onDown);
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onScroll);
  };
}
