import Resolver from '@forge/resolver';
import { isOpen, isPending, type Action } from '../domain/commitment';
import { invalid } from '../domain/errors';
import type { Side, TeamPolicy } from '../domain/types';
import { draftAsk, raiseAsk } from '../services/asks';
import { actAsUser } from '../services/lifecycle';
import { forgetThroughput } from '../services/model';
import { enqueue } from '../services/queue';
import { userScope } from '../services/scope';
import { myTeamIds, pinTeam, syncTeams } from '../services/teams';
import { deskView, detailView, ledgerView, panelView } from '../services/views';
import { sampleStatus } from '../services/sample';
import { getTeam, savePolicy } from '../store/records';
import { recent } from '../store/commitments';
import { access } from '../services/access';
import { friendly } from './shared';

const resolver = new Resolver();

type Req = { payload: Record<string, any>; context: Record<string, any> };

const def = (name: string, fn: (r: Req) => Promise<unknown>) =>
  resolver.define(name, async (req) => {
    try {
      return { ok: true, data: await fn(req as unknown as Req) };
    } catch (e) {
      console.log(JSON.stringify({ event: 'resolver.error', name, message: (e as Error).message }));
      return { ok: false, error: friendly(e) };
    }
  });

const scope = (r: Req) => userScope(r.context);

const contextIssue = (r: Req): string => r.payload.issueKey ?? r.context.extension?.issue?.key ?? '';
const contextProject = (r: Req): string => r.payload.projectKey ?? r.context.extension?.project?.key ?? '';

def('bootstrap', async (r) => {
  const s = scope(r);
  const mine = await myTeamIds(s);
  const teams = await syncTeams(s, !!r.payload.refresh);
  const project = contextProject(r);
  const here = project ? teams.find((t) => t.spaceKeys.includes(project)) : undefined;
  const involved = new Set((await recent(200)).filter((c) => isOpen(c.state) || isPending(c.state)).flatMap((c) => [c.ownerTeamId, c.requesterTeamId]));
  return {
    accountId: s.accountId,
    teams: teams
      .filter((t) => t.spaceKeys.length > 0)
      .sort((a, b) => Number(involved.has(b.id)) - Number(involved.has(a.id)) || a.name.localeCompare(b.name))
      .map((t) => ({ id: t.id, name: t.name, source: t.source, spaceKeys: t.spaceKeys, avatarUrl: t.avatarUrl })),
    myTeams: mine,
    here: here?.id ?? null,
    issueKey: contextIssue(r) || null,
    moduleKey: r.context.moduleKey ?? null,
    sample: !!(await sampleStatus()),
  };
});

def('sample', async (r) => {
  const s = scope(r);
  if (!s.accountId) throw invalid('Sign in to build the sample launch.');
  await enqueue({ kind: 'sample', accountId: s.accountId, remove: !!r.payload.remove });
  return { queued: true };
});

def('panel', async (r) => panelView(scope(r), contextIssue(r)));
def('desk', async (r) => deskView(scope(r), r.payload.teamId));
def('ledger', async (r) => ledgerView(scope(r)));
def('detail', async (r) => detailView(scope(r), r.payload.id));

def('draft', async (r) => {
  const d = await draftAsk(scope(r), { ...(r.payload as any), sourceIssueKey: r.payload.sourceIssueKey || contextIssue(r) });
  return {
    source: { key: d.source.key, summary: d.source.summary, url: d.source.url },
    requester: d.requester,
    owner: d.owner,
    alternatives: d.alternatives,
    goals: d.goals,
    goalWeight: d.goalWeight,
    title: d.title,
    detail: d.detail,
    neededBy: d.neededBy,
    size: d.size,
    negotiation: d.negotiation,
    model: d.model,
    duplicateOf: d.duplicateOf ?? null,
    cycle: d.cycle,
    existingWork: d.existingWork,
  };
});

def('raise', async (r) => {
  const res = await raiseAsk(scope(r), { ...(r.payload as any), sourceIssueKey: r.payload.sourceIssueKey || contextIssue(r), channel: 'jira' });
  return { id: res.commitment.id, state: res.commitment.state, autoAccepted: res.autoAccepted, reused: !!res.draft.duplicateOf };
});

const ACTIONS = new Set(['accept', 'counter', 'repropose', 'decline', 'withdraw', 'renegotiate', 'acceptRenegotiation', 'rejectRenegotiation', 'deliver']);

def('act', async (r) => {
  const { id, action, as } = r.payload as { id: string; action: Action; as?: Side };
  if (!action || !ACTIONS.has(action.kind)) throw invalid('That is not something you can do here.');
  const a = action.kind === 'deliver' ? { kind: 'deliver' as const, at: new Date().toISOString() } : action;
  const next = await actAsUser(scope(r), id, a, as);
  return { id: next.id, state: next.state, version: next.version };
});

def('pin', async (r) => pinTeam(scope(r), r.payload.teamId, !!r.payload.on));

def('policy', async (r) => {
  const s = scope(r);
  const p = r.payload.policy as TeamPolicy;
  if (!(await access(s).canActFor(await getTeam(p.teamId)))) throw invalid("Only people who can work in this team's space can change its policy.");
  const saved = await savePolicy(p, s.accountId ?? 'unknown');
  if (!saved) throw invalid('Someone changed this policy a moment ago. Reload and try again.');
  await forgetThroughput(p.teamId);
  await enqueue({ kind: 'replan', reason: 'policy', teams: [p.teamId] });
  return saved;
});

def('replan', async () => {
  await enqueue({ kind: 'replan', reason: 'manual' });
  return { queued: true };
});

export const handler = resolver.getDefinitions();
