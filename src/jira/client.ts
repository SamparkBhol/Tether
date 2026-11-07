import api, { route } from '@forge/api';
import { withRetry } from '../lib/retry';

export type As = { kind: 'user' } | { kind: 'app' } | { kind: 'impersonate'; accountId: string };

export const asUser: As = { kind: 'user' };
export const asApp: As = { kind: 'app' };
export const asAccount = (accountId: string): As => ({ kind: 'impersonate', accountId });

export class JiraError extends Error {
  constructor(
    public readonly status: number,
    public readonly operation: string,
  ) {
    super(`Jira could not ${operation} (status ${status}).`);
  }
}

const client = (as: As) =>
  as.kind === 'app' ? api.asApp() : as.kind === 'impersonate' ? api.asUser(as.accountId) : api.asUser();

type Route = ReturnType<typeof route>;

export const jira = async <T>(as: As, path: Route, operation: string, init: { method?: string; body?: unknown } = {}): Promise<T> => {
  const res = await withRetry(() =>
    client(as).requestJira(path, {
      method: init.method ?? 'GET',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    }),
  );
  if (res.status === 204) return undefined as T;
  if (!res.ok) throw new JiraError(res.status, operation);
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
};

export const jiraMaybe = async <T>(as: As, path: Route, operation: string): Promise<T | null> => {
  try {
    return await jira<T>(as, path, operation);
  } catch (e) {
    if (e instanceof JiraError && (e.status === 404 || e.status === 403)) return null;
    throw e;
  }
};

export { route };
