import { invoke, realtime } from '@forge/bridge';
import { useCallback, useEffect, useRef, useState } from 'react';

type Envelope<T> = { ok: true; data: T } | { ok: false; error: string };

export const call = async <T>(name: string, payload: Record<string, unknown> = {}): Promise<T> => {
  const res = (await invoke(name, payload)) as Envelope<T>;
  if (!res || !res.ok) throw new Error(res && !res.ok ? res.error : 'No response from Tether.');
  return res.data;
};

export interface Loaded<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => Promise<void>;
}

export const useCall = <T>(name: string, payload: Record<string, unknown>, deps: unknown[] = []): Loaded<T> => {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const latest = useRef(0);
  const reload = useCallback(async () => {
    const run = ++latest.current;
    setLoading(true);
    try {
      const d = await call<T>(name, payload);
      if (run === latest.current) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (run === latest.current) setError((e as Error).message);
    } finally {
      if (run === latest.current) setLoading(false);
    }
  }, deps);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, error, loading, reload };
};

export interface Change {
  kind: string;
  id: string;
  state: string;
  teams: string[];
  issues: string[];
}

export const useChanges = (onChange: (c: Change) => void, filter: (c: Change) => boolean = () => true) => {
  const handler = useRef(onChange);
  handler.current = onChange;
  const keep = useRef(filter);
  keep.current = filter;
  useEffect(() => {
    let sub: { unsubscribe: () => void } | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    realtime
      .subscribeGlobal<Change & Record<string, unknown>>('tether:changes', (payload) => {
        const c = (typeof payload === 'string' ? JSON.parse(payload) : payload) as Change;
        if (!keep.current(c)) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => handler.current(c), 400);
      })
      .then((s) => {
        sub = s as unknown as { unsubscribe: () => void };
      })
      .catch(() => undefined);
    return () => {
      if (timer) clearTimeout(timer);
      sub?.unsubscribe();
    };
  }, []);
};
