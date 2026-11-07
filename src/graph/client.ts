import api from '@forge/api';
import type { As } from '../jira/client';
import { withRetry } from '../lib/retry';
import { log } from '../lib/util';

export class GraphUnavailable extends Error {
  constructor(
    public readonly reason: 'forbidden' | 'error' | 'missing',
    detail: string,
  ) {
    super(detail);
  }
}

interface Edge<T> {
  node: T;
}

interface Connection<T> {
  edges?: (Edge<T> | null)[];
  pageInfo?: { hasNextPage: boolean; endCursor?: string };
}

const caller = (as: As) => (as.kind === 'impersonate' ? api.asUser(as.accountId) : api.asUser());

export const graphQuery = async <T>(
  as: As,
  query: string,
  variables: Record<string, unknown>,
  installContext?: string,
): Promise<T> => {
  if (as.kind === 'app') throw new GraphUnavailable('forbidden', 'Teamwork Graph needs a user context');
  const headers = installContext ? { 'X-Query-Context': installContext } : {};
  const res = await withRetry(() => caller(as).requestTeamworkGraph(query, variables, undefined, undefined, headers));
  if (res.status === 401 || res.status === 403) throw new GraphUnavailable('forbidden', `status ${res.status}`);
  if (!res.ok) throw new GraphUnavailable('error', `status ${res.status}`);
  const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (body.errors?.length && !body.data) {
    log('graph.errors', { messages: body.errors.map((e) => e.message).slice(0, 3) });
    throw new GraphUnavailable('error', body.errors[0].message);
  }
  if (!body.data) throw new GraphUnavailable('missing', 'empty response');
  return body.data;
};

export const nodes = <T>(conn: Connection<T> | null | undefined): T[] =>
  (conn?.edges ?? []).flatMap((e) => (e && e.node ? [e.node] : []));

export const safely = async <T>(fallback: T, run: () => Promise<T>): Promise<T> => {
  try {
    return await run();
  } catch (e) {
    if (e instanceof GraphUnavailable) {
      log('graph.unavailable', { reason: e.reason, detail: e.message });
      return fallback;
    }
    throw e;
  }
};
