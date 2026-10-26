import { useCallback, useEffect, useRef, useState } from "react";

export interface AsyncState<T> {
  data: T | undefined;
  error: Error | null;
  loading: boolean;
  reload: () => Promise<void>;
  setData: (update: T | ((prev: T | undefined) => T)) => void;
}

const toError = (err: unknown) => (err instanceof Error ? err : new Error(String(err)));

/**
 * Minimal data-fetching hook. Loads on mount and whenever `deps` change,
 * ignores responses from superseded requests, keeps the previous data while
 * a new request is in flight, and exposes `setData` for optimistic updates.
 */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const key = JSON.stringify(deps);
  const [state, setState] = useState<{ data: T | undefined; error: Error | null; key: string | null }>({
    data: undefined,
    error: null,
    key: null,
  });
  const [refreshing, setRefreshing] = useState(false);
  const latestLoad = useRef(load);
  const requestId = useRef(0);

  useEffect(() => {
    latestLoad.current = load;
  });

  const run = useCallback(async (forKey: string) => {
    const id = ++requestId.current;
    try {
      const data = await latestLoad.current();
      if (id === requestId.current) setState({ data, error: null, key: forKey });
    } catch (err) {
      if (id === requestId.current) setState((s) => ({ ...s, error: toError(err), key: forKey }));
    } finally {
      if (id === requestId.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void run(key);
  }, [key, run]);

  const reload = useCallback(async () => {
    setRefreshing(true);
    await run(key);
  }, [key, run]);

  const setData = useCallback((update: T | ((prev: T | undefined) => T)) => {
    setState((s) => ({
      ...s,
      data: typeof update === "function" ? (update as (p: T | undefined) => T)(s.data) : update,
    }));
  }, []);

  return { data: state.data, error: state.error, loading: state.key !== key || refreshing, reload, setData };
}
