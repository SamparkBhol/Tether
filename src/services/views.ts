import { allowedActions, isOpen, isPending } from '../domain/commitment';
import { notFound } from '../domain/errors';
import type { Commitment, Side, Team } from '../domain/types';
import { calibrate, reliability } from '../engine/forecast/calibration';
import { fromDay, toDay } from '../engine/forecast/calendar';
import { simulate } from '../engine/forecast/montecarlo';
import { sizeAhead } from '../engine/negotiate/queue';
import { toQueueItem } from '../engine/propagate/replan';
import { asApp } from '../jira/client';
import { getIssue, getIssues } from '../jira/issues';
import { todayIso, unique } from '../lib/util';
import { forOwner, forRequester, getCommitment, openCommitments, recent, touchingIssues } from '../store/commitments';
import { graphFor } from './asks';
import { allTeams, eventsFor, getAsks, outcomesFor, snapshotsFor } from '../store/records';
import { commitmentSeed, forecastCommitment, negotiateFor, ownerQueue } from './forecasting';
import { loadModel } from './model';
import type { Scope } from './scope';
import { myTeamIds, requireTeam } from './teams';
import { access } from './access';
import { deliveryForIssue } from '../graph/context';
import { graphScope } from './scope';

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
    forecastP85: c.forecastP85 ?? null,
    waitingDays: isPending(c.state) ? Math.max(0, toDay(todayIso()) - toDay(c.updatedAt.slice(0, 10))) : 0,
    waitsOn: [] as { title: string; owner: string; state: string }[],
    delta: c.forecastP85 && (isOpen(c.state) || isPending(c.state)) ? toDay(c.forecastP85) - toDay(c.terms.dueDate) : null,
    updatedAt: c.updatedAt,
  };
};

export type Card = ReturnType<typeof card>;

const chain = async (cards: Card[], pool: Commitment[], teams: Map<string, Team>) => {
  const open = pool.filter((c) => isOpen(c.state));
  if (open.length < 2 || !cards.length) return cards;
  const g = await graphFor(open);
  const byId = new Map(open.map((c) => [c.id, c]));
  for (const k of cards) {
    k.waitsOn = (g.upstreamOf.get(k.id) ?? [])
      .map((u) => byId.get(u))
      .filter((u): u is Commitment => !!u)
      .map((u) => ({ title: u.title, owner: teams.get(u.ownerTeamId)?.name ?? 'another team', state: u.state }));
  }
  return cards;
};

export const panelView = async (s: Scope, issueKey: string) => {
  const issue = await getIssue(s.as, issueKey);
  if (!issue) throw notFound(`Work item ${issueKey}`);
  const [teams, favs, rows] = await Promise.all([teamIndex(), myTeamIds(s), touchingIssues([issueKey])]);
  const visible = rows.filter((c) => c.state !== 'withdrawn');
  const mine = await access(s).acting(visible.flatMap((c) => [c.ownerTeamId, c.requesterTeamId]));
  const waitingOn = visible.filter((c) => c.sourceIssueKey === issueKey).map((c) => card(c, teams, mine));
  await chain(waitingOn, await openCommitments(), teams);
  const promisedTo = visible.filter((c) => c.ownerIssueKey === issueKey).map((c) => card(c, teams, mine));
  const readiness = await readinessFor(waitingOn.filter((c) => isOpen(c.state) || isPending(c.state)).map((c) => c.id));
  return {
    issue: { key: issue.key, summary: issue.summary, projectKey: issue.projectKey, url: issue.url, dueDate: issue.dueDate ?? null },
    waitingOn,
    promisedTo,
    readiness,
    myTeams: favs,
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
  const [teams, inbound, outbound, outcomes] = await Promise.all([
    teamIndex(),
    forOwner(teamId, 200),
    forRequester(teamId, 200),
    outcomesFor(teamId),
  ]);
  const model = await loadModel(team);
  const mine = await access(s).acting([teamId, ...inbound.map((c) => c.requesterTeamId), ...outbound.map((c) => c.ownerTeamId)]);
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
      perWeek: Math.round((model.basis === 'declared' ? model.policy.declaredDailyCapacity * 5 : model.summary.perWeek) * 10) / 10,
      completed: model.summary.completed,
      askShare: model.policy.askShare,
      shareSource: model.shareSource,
      learnedFrom: model.learnedFrom,
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
    promised: await chain(inbound.filter((c) => isOpen(c.state)).map((c) => card(c, teams, mine)), await openCommitments(), teams),
    asked: outbound.filter((c) => isOpen(c.state) || isPending(c.state)).map((c) => card(c, teams, mine)),
    closed: inbound.filter((c) => !isOpen(c.state) && !isPending(c.state)).slice(0, 20).map((c) => card(c, teams, mine)),
  };
};

export const ledgerView = async (s: Scope) => {
  const [teams, favs, rows] = await Promise.all([teamIndex(), myTeamIds(s), recent(400)]);
  const live = rows.filter((c) => c.state !== 'withdrawn' && c.state !== 'declined');
  const mine = await access(s).acting(live.flatMap((c) => [c.ownerTeamId, c.requesterTeamId]));
  const edges = live
    .filter((c) => isOpen(c.state) || isPending(c.state))
    .map((c) => ({ id: c.id, from: c.ownerTeamId, to: c.requesterTeamId, state: c.state, confidence: c.confidence ?? null }));
  const nodeIds = unique(edges.flatMap((e) => [e.from, e.to]));
  return {
    myTeams: favs,
    teams: [...teams.values()].map(teamLite),
    nodes: nodeIds.map((id) => teamLite(teams.get(id))).filter(Boolean),
    edges,
    commitments: await chain(live.map((c) => card(c, teams, mine)), live, teams),
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
  const [teams, events, snapshots] = await Promise.all([teamIndex(), eventsFor(id), snapshotsFor(id)]);
  const mine = await access(s).acting([c.ownerTeamId, c.requesterTeamId]);
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
    seed: commitmentSeed(c.id),
  });
  const negotiation = isPending(c.state) || c.state === 'at_risk' ? await negotiateFor(item, model, c.id) : null;
  const keys = [c.sourceIssueKey, c.ownerIssueKey].filter((k): k is string => !!k);
  const issues = await getIssues(asApp, keys);
  const ownerIssue = issues.find((i) => i.key === c.ownerIssueKey);
  const delivery = ownerIssue && !s.system ? await deliveryForIssue(graphScope(s), ownerIssue.id) : null;
  return {
    delivery,
    commitment: card(c, teams, mine),
    issues: issues.map((i) => ({ key: i.key, summary: i.summary, status: i.status, statusCategory: i.statusCategory, url: i.url })),
    forecast: {
      basis: model.basis,
      windowEnd: model.windowEnd ?? null,
      probability: live.probabilityByDue,
      dates: live.dates,
      curve: live.curve,
      histogram: live.histogram,
      inputs: live.inputs,
      itemsAhead: sizeAhead(queue, item),
    },
    negotiation,
    history: events.map((e) => ({ type: e.type, at: e.at, side: e.actor.side, agent: e.actor.agent ?? null, accountId: e.actor.accountId ?? null, reason: e.reason ?? null, to: e.to })),
    trend: snapshots.map((x) => ({ date: x.taken_on, probability: Number(x.probability) })),
  };
};
