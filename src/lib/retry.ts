import { sleep } from './util';

export interface HttpLike {
  status: number;
  headers: { get(name: string): string | null };
}

const RETRYABLE = new Set([429, 502, 503, 504]);

export const withRetry = async <T extends HttpLike>(call: () => Promise<T>, attempts = 4): Promise<T> => {
  let last: T | undefined;
  for (let i = 0; i < attempts; i++) {
    last = await call();
    if (!RETRYABLE.has(last.status)) return last;
    const hinted = Number(last.headers.get('Retry-After'));
    const wait = Number.isFinite(hinted) && hinted > 0 ? hinted * 1000 : 400 * 2 ** i + Math.random() * 200;
    await sleep(Math.min(wait, 8000));
  }
  return last!;
};
