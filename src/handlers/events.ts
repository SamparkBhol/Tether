import type { AsyncEvent } from '@forge/events';
import { kvs } from '@forge/kvs';
import { log } from '../lib/util';
import { replanAll } from '../services/replanning';
import { enqueue, type Job } from '../services/queue';
import { systemScope } from '../services/scope';
import { syncTeams } from '../services/teams';
import { migrate } from '../store/db';
import { touchingIssues } from '../store/commitments';

interface IssueEvent {
  eventType: string;
  issue?: { key?: string; id?: string; fields?: { status?: { statusCategory?: { key?: string } } } };
  changelog?: { id?: string; items?: { field?: string; fieldId?: string }[] };
  issueLink?: { sourceIssueId?: string; destinationIssueId?: string };
}

const RELEVANT = new Set(['status', 'duedate', 'Sprint', 'assignee', 'resolution', 'IssueParentAssociation', 'parent', 'Rank', 'Link']);

export const onIssue = async (event: IssueEvent, context: Record<string, any>) => {
  const key = event.issue?.key;
  if (!key) return;
  const items = event.changelog?.items ?? [];
  if (event.eventType === 'avi:jira:updated:issue' && items.length && !items.some((i) => RELEVANT.has(i.field ?? '') || RELEVANT.has(i.fieldId ?? ''))) return;
  const dedupe = event.changelog?.id ? `seen:${event.changelog.id}` : null;
  if (dedupe && (await kvs.get(dedupe))) return;
  const touching = await touchingIssues([key]);
  if (!touching.length && event.eventType !== 'avi:jira:deleted:issue') return;
  if (dedupe) await kvs.set(dedupe, true, { ttl: { value: 2, unit: 'DAYS' } });
  log('issue.relevant', { key, type: event.eventType, commitments: touching.length, ctx: !!context?.installContext });
  await enqueue({ kind: 'replan', reason: `issue:${key}`, teams: [...new Set(touching.map((c) => c.ownerTeamId))] }, 20);
};

export const onLifecycle = async () => {
  await enqueue({ kind: 'migrate' });
};

const DEBOUNCE = 'replan:last';

export const consume = async (event: AsyncEvent, context: Record<string, any>) => {
  const job = event.body as unknown as Job;
  const s = systemScope(context);
  switch (job.kind) {
    case 'migrate':
      await migrate();
      return;
    case 'sync':
      await syncTeams(s, true);
      return;
    case 'issue':
    case 'replan': {
      const last = (await kvs.get<number>(DEBOUNCE)) ?? 0;
      if (Date.now() - last < 15_000 && job.kind === 'replan' && job.reason !== 'manual' && job.reason !== 'nightly') return;
      await kvs.set(DEBOUNCE, Date.now(), { ttl: { value: 1, unit: 'HOURS' } });
      await replanAll(s, job.kind === 'replan' ? job.reason : `issue:${job.key}`);
      return;
    }
  }
};

export const nightly = async (_event: unknown, context: Record<string, any>) => {
  await migrate();
  await enqueue({ kind: 'replan', reason: 'nightly' });
  log('nightly.queued', { install: context?.installContext ?? null });
};
