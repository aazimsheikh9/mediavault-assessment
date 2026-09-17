import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Minimal URL <-> state sync over the History API. No router dependency.
 *
 * Why hand-rolled: this is a single-screen app and all we need is to read the
 * query string into typed state and write it back. A router would be more to
 * explain than it earns here. It:
 *   - reads `location.search` into a URLSearchParams-derived object
 *   - lets callers write params back with either `push` (a discrete navigation
 *     the user should be able to go Back over) or `replace` (transient updates
 *     like each keystroke, which must NOT create a history entry per character)
 *   - stays in sync with Back/Forward via the `popstate` event
 */

export type UrlParams = Record<string, string>;

function read(): UrlParams {
  const out: UrlParams = {};
  const sp = new URLSearchParams(window.location.search);
  for (const [k, v] of sp.entries()) out[k] = v;
  return out;
}

function serialize(params: UrlParams): string {
  const sp = new URLSearchParams();
  // Stable key order so the URL is deterministic and diff-friendly.
  for (const key of Object.keys(params).sort()) {
    const value = params[key];
    if (value != null && value !== '') sp.set(key, value);
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : window.location.pathname;
}

export function useUrlState() {
  const [params, setParams] = useState<UrlParams>(() => read());

  // Keep local state in sync when the user uses Back/Forward.
  useEffect(() => {
    const onPop = () => setParams(read());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Latest params in a ref so the writer can merge without being a dep.
  const latest = useRef(params);
  latest.current = params;

  const write = useCallback(
    (patch: UrlParams, mode: 'push' | 'replace' = 'push') => {
      const next: UrlParams = { ...latest.current };
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === '') delete next[k];
        else next[k] = v;
      }
      const url = serialize(next);
      if (mode === 'push') window.history.pushState(null, '', url);
      else window.history.replaceState(null, '', url);
      setParams(next);
    },
    [],
  );

  return [params, write] as const;
}
