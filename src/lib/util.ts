import { randomUUID } from 'crypto';

export const newId = () => randomUUID();
export const nowIso = () => new Date().toISOString();
export const todayIso = () => nowIso().slice(0, 10);

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const chunk = <T>(xs: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
};

export const unique = <T>(xs: T[]) => [...new Set(xs)];

export const groupBy = <T, K>(xs: T[], key: (x: T) => K) => {
  const m = new Map<K, T[]>();
  for (const x of xs) m.set(key(x), [...(m.get(key(x)) ?? []), x]);
  return m;
};

export const parseJson = <T>(s: string | null | undefined, fallback: T): T => {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

export const round = (n: number, digits = 2) => Math.round(n * 10 ** digits) / 10 ** digits;

export const log = (event: string, data: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ event, ...data }));

export const kvKey = (...parts: string[]) => parts.join(':').replace(/[^a-zA-Z0-9:._#-]/g, '_').slice(0, 480);
