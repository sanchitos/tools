import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from './api.js';

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/**
 * Standard data-fetch hook. Runs `fn` on mount and whenever a value in `deps`
 * changes, tracking loading/error and ignoring results from stale runs.
 * `reload()` re-runs on demand (e.g. after a mutation).
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null });
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const run = useCallback(() => {
    let active = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fnRef.current()
      .then((data) => {
        if (active) setState({ data, loading: false, error: null });
      })
      .catch((err) => {
        if (!active) return;
        const message = err instanceof ApiError ? err.message : 'Something went wrong';
        setState({ data: null, loading: false, error: message });
      });
    return () => {
      active = false;
    };
  }, deps);

  useEffect(run, [run]);

  const reload = useCallback(() => {
    run();
  }, [run]);

  return { ...state, reload };
}
