import { allowedActions, isOpen, isPending } from '../domain/commitment';
import { notFound } from '../domain/errors';
import type { Commitment, Side, Team } from '../domain/types';
import { calibrate, reliability } from '../engine/forecast/calibration';
import { fromDay, toDay } from '../engine/forecast/calendar';
import { simulate } from '../engine/forecast/montecarlo';
import { hashSeed } from '../engine/forecast/random';
import { sizeAhead } from '../engine/negotiate/queue';
import { toQueueItem } from '../engine/propagate/replan';
import { asApp } from '../jira/client';
import { getIssue, getIssues } from '../jira/issues';
import { todayIso, unique } from '../lib/util';
import { forOwner, forRequester, getCommitment, recent, touchingIssues } from '../store/commitments';
import { allTeams, eventsFor, getAsks, outcomesFor, snapshotsFor } from '../store/records';
import { forecastCommitment, negotiateFor, ownerQueue } from './forecasting';
import { loadModel } from './model';
import type { Scope } from './scope';
import { myTeamIds, requireTeam } from './teams';

const teamIndex = async () => new Map((await allTeams()).map((t) => [t.id, t]));

const teamLite = (t?: Team) => (t ? { id: t.id, name: t.name, avatarUrl: t.avatarUrl, source: t.source, spaceKeys: t.spaceKeys } : null);

const sideOf = (mine: string[], c: Commitment): Side | null =>
  mine.includes(c.ownerTeamId) ? 'owner' : mine.includes(c.requesterTeamId) ? 'requester' : null;

const card = (c: Commitment, teams: Map<string, Team>, mine: string[]) => {
  const side = sideOf(mine, c);
  const both = mine.includes(c.ownerTeamId) && mine.includes(c.requesterTeamId);
  return {
    id: c.id,
    title: c.title,
    state: c.state,
    neededBy: c.neededBy,
    terms: c.terms,
    pendingTerms: c.pendingTerms ?? null,
    confidence: c.confidence ?? null,
    committedConfidence: c.committedConfidence ?? null,
    goalWeight: c.goalWeight,
    sourceIssueKey: c.sourceIssueKey,
    ownerIssueKey: c.ownerIssueKey ?? null,
    owner: teamLite(teams.get(c.ownerTeamId)),
    requester: teamLite(teams.get(c.requesterTeamId)),
    side,
    actions: side ? unique([...allowedActions(c, side), ...(both ? allowedActions(c, side === 'owner' ? 'requester' : 'owner') : [])]) : [],
    lateBy: isOpen(c.state) ? Math.max(0, toDay(todayIso()) - toDay(c.terms.dueDate)) : 0,
    updatedAt: c.updatedAt,
  };
};

export type Card = ReturnType<typeof card>;

export const panelView = async (s: Scope, issueKey: string) => {
  const issue = await getIssue(s.as, issueKey);
  if (!issue) throw notFound(`Work item ${issueKey}`);
  const [teams, mine, rows] = await Promise.all([teamIndex(), myTeamIds(s), touchingIssues([issueKey])]);
  const visible = rows.filter((c) => c.state !== 'withdrawn');
  const waitingOn = visible.filter((c) => c.sourceIssueKey === issueKey).map((c) => card(c, teams, mine));
  const promisedTo = visible.filter((c) => c.ownerIssueKey === issueKey).map((c) => card(c, teams, mine));
  const readiness = await readinessFor(waitingOn.filter((c) => isOpen(c.state) || isPending(c.state)).map((c) => c.id));
  return {
    issue: { key: issue.key, summary: issue.summary, projectKey: issue.projectKey, url: issue.url, dueDate: issue.dueDate ?? null },
    waitingOn,
    promisedTo,
    readiness,
    myTeams: mine,
  };
};

export const readinessFor = async (ids: string[]) => {
  if (!ids.length) return null;
  const sims: { samples: Int32Array }[] = [];
  for (const id of ids) {
    const c = await getCommitment(id);
    if (!c) continue;
    const owner = await requireTeam(c.ownerTeamId);
    sims.push(await forecastCommitment(c, await loadModel(owner)));
  }
  if (!sims.length) return null;
  const n = Math.min(...sims.map((x) => x.samples.length));
  const joint = new Int32Array(n);
  for (let i = 0; i < n; i++) joint[i] = Math.max(...sims.map((x) => x.samples[i]));
  const sorted = Int32Array.from(joint).sort();
  const at = (q: number) => fromDay(sorted[Math.min(n - 1, Math.ceil(q * n) - 1)]);
  const curve: { date: string; probability: number }[] = [];
  const first = sorted[0];
  const last = sorted[Math.floor(n * 0.98)];
  const stride = Math.max(1, Math.ceil((last - first) / 30));
  let j = 0;
  for (let d = first; d <= last; d += stride) {
    while (j < n && sorted[j] <= d) j++;
    curve.push({ date: fromDay(d), probability: j / n });
  }
  return { p50: at(0.5), p85: at(0.85), p95: at(0.95), curve, dependencies: sims.length };
};

export const deskView = async (s: Scope, teamId: string) => {
  const team = await requireTeam(teamId);
  const [teams, mine, inbound, outbound, outcomes] = await Promise.all([
    teamIndex(),
    myTeamIds(s),
    forOwner(teamId, 200),
    forRequester(teamId, 200),
    outcomesFor(teamId),
  ]);
  const model = await loadModel(team);
  const pending = inbound.filter((c) => isPending(c.state));
  const offers = await Promise.all(
    pending.slice(0, 12).map(async (c) => ({
      id: c.id,
      negotiation: await negotiateFor(toQueueItem(c), model, c.id),
    })),
  );
  const asks = await getAsks(pending.map((c) => c.askId));
  return {
    team: teamLite(team),
    member: mine.includes(teamId),
    model: {
      basis: model.basis,
      windowEnd: model.windowEnd ?? null,
      perWeek: Math.round(model.summary.perWeek * 10) / 10,
      completed: model.summary.completed,
      askShare: model.policy.askShare,
      policy: model.policy,
    },
    calibration: calibrate(outcomes.map((o) => ({ predicted: o.predicted, hit: o.hit }))),
    reliability: reliability(outcomes.map((o) => ({ onTime: o.hit }))),
    inbox: pending.map((c) => ({
      ...card(c, teams, mine),
      detail: asks.find((a) => a.id === c.askId)?.detail ?? '',
      channel: asks.find((a) => a.id === c.askId)?.channel ?? 'jira',
      agentClient: asks.find((a) => a.id === c.askId)?.agentClient ?? null,
      negotiation: offers.find((o) => o.id === c.id)?.negotiation ?? null,
    })),
    promised: inbound.filter((c) => isOpen(c.state)).map((c) => card(c, teams, mine)),
    asked: outbound.filter((c) => isOpen(c.state) || isPending(c.state)).map((c) => card(c, teams, mine)),
    closed: inbound.filter((c) => !isOpen(c.state) && !isPending(c.state)).slice(0, 20).map((c) => card(c, teams, mine)),
  };
};

export const ledgerView = async (s: Scope) => {
  const [teams, mine, rows] = await Promise.all([teamIndex(), myTeamIds(s), recent(400)]);
  const live = rows.filter((c) => c.state !== 'withdrawn' && c.state !== 'declined');
  const edges = live
    .filter((c) => isOpen(c.state) || isPending(c.state))
    .map((c) => ({ id: c.id, from: c.ownerTeamId, to: c.requesterTeamId, state: c.state, confidence: c.confidence ?? null }));
  const nodeIds = unique(edges.flatMap((e) => [e.from, e.to]));
  return {
    myTeams: mine,
    teams: [...teams.values()].map(teamLite),
    nodes: nodeIds.map((id) => teamLite(teams.get(id))).filter(Boolean),
    edges,
    commitments: live.map((c) => card(c, teams, mine)),
    stats: {
      open: live.filter((c) => isOpen(c.state)).length,
      atRisk: live.filter((c) => c.state === 'at_risk' || c.state === 'renegotiating').length,
      pending: live.filter((c) => isPending(c.state)).length,
      delivered: rows.filter((c) => c.state === 'delivered').length,
    },
  };
};

export const detailView = async (s: Scope, id: string) => {
  const c = await getCommitment(id);
  if (!c) throw notFound('That commitment');
  const [teams, mine, events, snapshots] = await Promise.all([teamIndex(), myTeamIds(s), eventsFor(id), snapshotsFor(id)]);
  const owner = await requireTeam(c.ownerTeamId);
  const model = await loadModel(owner);
  const queue = await ownerQueue(c.ownerTeamId, c.id);
  const item = toQueueItem(c);
  const live = simulate({
    today: toDay(todayIso()),
    calendar: model.policy,
    throughput: model.throughput,
    declaredDailyCapacity: model.policy.declaredDailyCapacity,
    askShare: model.policy.askShare,
    itemsAhead: sizeAhead(queue, item),
    size: c.terms.size,
    dueDay: toDay(c.terms.dueDate),
    seed: hashSeed(c.id, todayIso()),
  });
  const negotiation = isPending(c.state) || c.state === 'at_risk' ? await negotiateFor(item, model, c.id) : null;
  const keys = [c.sourceIssueKey, c.ownerIssueKey].filter((k): k is string => !!k);
  const issues = await getIssues(asApp, keys);
  return {
    commitment: card(c, teams, mine),
    issues: issues.map((i) => ({ key: i.key, summary: i.summary, status: i.status, statusCategory: i.statusCategory, url: i.url })),
    forecast: {
      basis: model.basis,
      windowEnd: model.windowEnd ?? null,
      probability: live.probabilityByDue,
      dates: live.dates,
      curve: live.curve,
      itemsAhead: sizeAhead(queue, item),
    },
    negotiation,
    history: events.map((e) => ({ type: e.type, at: e.at, side: e.actor.side, agent: e.actor.agent ?? null, accountId: e.actor.accountId ?? null, reason: e.reason ?? null, to: e.to })),
    trend: snapshots.map((x) => ({ date: x.taken_on, probability: Number(x.probability) })),
  };
};
