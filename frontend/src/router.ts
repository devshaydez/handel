import { useEffect, useState } from 'react';

// Tiny hash router. Keeps working inside sandboxed iframes by mirroring the
// hash into React state and falling back to state-only if the hash is blocked.
const read = () => {
  try {
    const h = window.location.hash.replace(/^#/, '');
    return h || '/';
  } catch {
    return '/';
  }
};

let current = read();
const subs = new Set<(p: string) => void>();

export function go(path: string, opts?: { replace?: boolean }) {
  current = path;
  try {
    if (opts?.replace) window.history.replaceState(null, '', '#' + path);
    else window.location.hash = path;
  } catch {
    /* ignore */
  }
  subs.forEach((f) => f(path));
  try {
    window.scrollTo({ top: 0 });
    document.querySelector('.main')?.scrollTo({ top: 0 });
  } catch {
    /* ignore */
  }
}

export interface Route {
  path: string;
  parts: string[];
  query: URLSearchParams;
}

export function parse(raw: string): Route {
  const [path, qs] = raw.split('?');
  return { path, parts: path.split('/').filter(Boolean), query: new URLSearchParams(qs ?? '') };
}

export function useRoute(): Route {
  const [raw, setRaw] = useState(current);
  useEffect(() => {
    const f = (p: string) => setRaw(p);
    subs.add(f);
    const onHash = () => {
      current = read();
      setRaw(current);
    };
    window.addEventListener('hashchange', onHash);
    onHash();
    return () => {
      subs.delete(f);
      window.removeEventListener('hashchange', onHash);
    };
  }, []);
  return parse(raw);
}
