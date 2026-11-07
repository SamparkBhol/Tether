import { DomainError } from '../domain/errors';
import { JiraError } from '../jira/client';
import { log } from '../lib/util';
import { userScope, type Scope } from '../services/scope';

export interface ActionPayload {
  context?: { cloudId?: string; jira?: { issueKey?: string | number; projectKey?: string }; confluence?: { contentId?: string } };
  [k: string]: unknown;
}

export interface InvocationContext {
  accountId?: string;
  cloudId?: string;
  installContext?: string;
  principal?: { accountId?: string };
}

export const scopeFromAction = (payload: ActionPayload, context: InvocationContext): Scope =>
  userScope({ ...context, cloudId: context.cloudId ?? payload.context?.cloudId });

export const friendly = (e: unknown): string => {
  if (e instanceof DomainError) return e.message;
  if (e instanceof JiraError) return e.status === 403 ? 'You do not have access to that in Jira.' : e.message;
  return 'Something went wrong on our side. Try again in a moment.';
};

export const str = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
export const num = (v: unknown, d: number) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : d;
};

export const issueKeyFrom = (payload: ActionPayload, field = 'issueKey') => {
  const supplied = str(payload[field]).toUpperCase();
  if (/^[A-Z][A-Z0-9_]+-\d+$/.test(supplied)) return supplied;
  const ctx = str(payload.context?.jira?.issueKey).toUpperCase();
  return /^[A-Z][A-Z0-9_]+-\d+$/.test(ctx) ? ctx : '';
};

export const guard =
  <P, C>(name: string, fn: (payload: P, context: C) => Promise<unknown>) =>
  async (payload: P, context: C) => {
    try {
      return await fn(payload, context);
    } catch (e) {
      log('handler.error', { name, message: (e as Error).message, code: (e as DomainError).code });
      return { ok: false, error: friendly(e) };
    }
  };
