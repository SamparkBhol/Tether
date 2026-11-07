import { invalid, notFound } from '../domain/errors';
import { isOpen, isPending } from '../domain/commitment';
import type { Ask, Channel, Commitment, Goal, Team } from '../domain/types';
import { toDay } from '../engine/forecast/calendar';
import type { Negotiation } from '../engine/negotiate/options';
import { buildGraph } from '../engine/propagate/graph';
import { goalWeight } from '../engine/weight';
import { goalsForIssue } from '../graph/context';
import { asApp } from '../jira/client';
import { getIssue, parentChain, type IssueLite } from '../jira/issues';
import { newId, nowIso, todayIso } from '../lib/util';
import { insertCommitment, openCommitments } from '../store/commitments';
import { appendEvent, insertAsk } from '../store/records';
import { negotiateFor } from './forecasting';
import { apply } from './lifecycle';
import { loadModel, type TeamModelView } from './model';
import { broadcast } from './notify';
import { enqueue } from './queue';
import { graphScope, type Scope } from './scope';
import { findTeams, requireTeam, syncTeams, teamForProject } from './teams';

export interface AskInput {
  sourceIssueKey: string;
  ownerTeamId?: string;
  ownerQuery?: string;
  title?: string;
  detail?: string;
  neededBy: string;
  size?: number;
  channel?: Channel;
  agentClient?: string;
  useExisting?: string | null;
}

export interface Draft {
  source: IssueLite;
  requester: Team;
  owner: Team;
  alternatives: Team[];
  goals: Goal[];
  goalWeight: number;
  title: string;
  detail: string;
  neededBy: string;
  size: number;
  negotiation: Negotiation;
  model: { basis: TeamModelView['basis']; windowEnd?: string; perWeek: number; askShare: number };
  duplicateOf?: Commitment;
  cycle: boolean;
  existingWork: { key: string; summary: string }[];
}

const cleanTitle = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 200);

const resolveOwner = async (s: Scope, input: AskInput, requester: Team) => {
  const teams = await syncTeams(s);
  if (input.ownerTeamId) return { owner: await requireTeam(input.ownerTeamId), alternatives: [] as Team[] };
  const matches = findTeams(teams, input.ownerQuery ?? '').filter((t) => t.id !== requester.id);
  if (!matches.length) throw invalid(`I could not find a team called "${input.ownerQuery}". Pick one from the list.`);
  return { owner: matches[0], alternatives: matches.slice(1, 5) };
};

export const draftAsk = async (s: Scope, input: AskInput): Promise<Draft> => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.neededBy)) throw invalid('Give a needed-by date like 2026-12-04.');
  if (toDay(input.neededBy) <= toDay(todayIso())) throw invalid('The needed-by date has to be in the future.');
  const source = await getIssue(s.as, input.sourceIssueKey);
  if (!source) throw notFound(`Work item ${input.sourceIssueKey}`);
  const requester = await teamForProject(s, source.projectKey);
  const { owner, alternatives } = await resolveOwner(s, input, requester);
  if (owner.id === requester.id) throw invalid('That is your own team. Tether is for asks between teams.');

  const goals = await goalsForIssue(graphScope(s), source.id);
  const weight = goalWeight(goals, toDay(todayIso()));
  const size = Math.max(1, Math.min(20, Math.round(input.size ?? 1)));
  const title = cleanTitle(input.title || `${source.summary} (for ${requester.name})`);
  const model = await loadModel(owner);
  const negotiation = await negotiateFor(
    { id: `draft:${source.key}:${owner.id}`, title, size, dueDate: input.neededBy, goalWeight: weight, createdAt: nowIso(), requesterTeamId: requester.id },
    model,
  );

  const open = await openCommitments();
  const duplicateOf = open.find(
    (c) => c.sourceIssueKey === source.key && c.ownerTeamId === owner.id && (isOpen(c.state) || isPending(c.state)),
  );
  const parents = await parentChain(asApp, [source.key]);
  const lineage = new Set<string>([source.key]);
  for (let k = parents.get(source.key); k && !lineage.has(k); k = parents.get(k)) lineage.add(k);
  const cycle = open.some(
    (c) =>
      isOpen(c.state) &&
      c.requesterTeamId === owner.id &&
      c.ownerTeamId === requester.id &&
      !!c.ownerIssueKey &&
      lineage.has(c.ownerIssueKey),
  );

  const claimed = new Set(open.map((c) => c.ownerIssueKey).filter(Boolean));
  const existingWork = source.blockedBy
    .filter((b) => owner.spaceKeys.includes(b.projectKey) && b.statusCategory !== 'done' && !claimed.has(b.key))
    .map(({ key, summary }) => ({ key, summary }));

  return {
    source,
    requester,
    owner,
    alternatives,
    goals,
    goalWeight: weight,
    title,
    detail: (input.detail ?? '').trim().slice(0, 4000),
    neededBy: input.neededBy,
    size,
    negotiation,
    model: { basis: model.basis, windowEnd: model.windowEnd, perWeek: model.summary.perWeek, askShare: model.policy.askShare },
    duplicateOf,
    cycle,
    existingWork,
  };
};

const shouldAutoAccept = (d: Draft, model: TeamModelView) =>
  model.policy.autoAcceptMaxSize > 0 &&
  d.size <= model.policy.autoAcceptMaxSize &&
  d.negotiation.verdict === 'easy' &&
  (!model.policy.autoAcceptGoalAligned || d.goals.length > 0);

export const raiseAsk = async (s: Scope, input: AskInput): Promise<{ commitment: Commitment; draft: Draft; autoAccepted: boolean }> => {
  const d = await draftAsk(s, input);
  if (d.duplicateOf) return { commitment: d.duplicateOf, draft: d, autoAccepted: false };
  if (d.cycle) throw invalid(`${d.owner.name} is already waiting on ${d.requester.name} for this work. Untangle that first.`);
  const at = nowIso();
  const ask: Ask = {
    id: newId(),
    requesterTeamId: d.requester.id,
    ownerTeamId: d.owner.id,
    sourceIssueKey: d.source.key,
    title: d.title,
    detail: d.detail,
    neededBy: d.neededBy,
    goalIds: d.goals.map((g) => g.id),
    createdBy: s.accountId ?? 'unknown',
    channel: input.channel ?? 'jira',
    agentClient: input.agentClient,
    createdAt: at,
  };
  const commitment: Commitment = {
    id: newId(),
    askId: ask.id,
    requesterTeamId: d.requester.id,
    ownerTeamId: d.owner.id,
    sourceIssueKey: d.source.key,
    ownerIssueKey: input.useExisting && d.existingWork.some((w) => w.key === input.useExisting) ? input.useExisting : undefined,
    title: d.title,
    state: 'proposed',
    neededBy: d.neededBy,
    terms: { dueDate: d.neededBy, scope: d.detail.slice(0, 500), size: d.size },
    goalWeight: d.goalWeight,
    confidence: d.negotiation.options[0]?.confidence,
    version: 1,
    createdAt: at,
    updatedAt: at,
  };
  await insertAsk(ask);
  await insertCommitment(commitment);
  await appendEvent({
    id: newId(),
    commitmentId: commitment.id,
    type: 'raised',
    actor: { side: 'requester', accountId: s.accountId, agent: input.agentClient },
    at,
    from: 'proposed',
    to: 'proposed',
    data: { channel: ask.channel, verdict: d.negotiation.verdict },
  });
  await broadcast(commitment, 'raised');

  const model = await loadModel(d.owner);
  if (shouldAutoAccept(d, model)) {
    const accepted = await apply({ ...s, system: true }, commitment.id, { kind: 'accept' }, { side: 'system', agent: 'policy' }, 'Auto-accepted by team policy');
    return { commitment: accepted, draft: d, autoAccepted: true };
  }
  await enqueue({ kind: 'replan', reason: 'raised', teams: [d.owner.id] }, 3);
  return { commitment, draft: d, autoAccepted: false };
};

export const graphFor = async (commitments: Commitment[]) => {
  const open = commitments.filter((c) => isOpen(c.state));
  const parents = await parentChain(asApp, open.flatMap((c) => [c.sourceIssueKey, c.ownerIssueKey ?? '']).filter(Boolean));
  return buildGraph(open, (k) => parents.get(k));
};
