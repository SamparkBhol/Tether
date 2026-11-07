import { invalid } from '../domain/errors';
import type { Commitment } from '../domain/types';
import { isOpen } from '../domain/commitment';
import { toDay } from '../engine/forecast/calendar';
import type { Negotiation, Option } from '../engine/negotiate/options';
import { replan, type TeamModel } from '../engine/propagate/replan';
import { reachDownstream } from '../engine/propagate/graph';
import { todayIso } from '../lib/util';
import { draftAsk, graphFor, raiseAsk } from '../services/asks';
import { actAsUser } from '../services/lifecycle';
import { loadModel } from '../services/model';
import { day } from '../services/notify';
import { findTeams, myTeamIds, syncTeams } from '../services/teams';
import { deskView, detailView, panelView } from '../services/views';
import { getCommitment, openCommitments, touchingIssues } from '../store/commitments';
import { getPolicy, getTeam, savePolicy } from '../store/records';
import { access } from '../services/access';
import { enqueue } from '../services/queue';
import { forgetThroughput } from '../services/model';
import { guard, issueKeyFrom, num, scopeFromAction, str, type ActionPayload, type InvocationContext } from './shared';

const pct = (p?: number | null) => (p === undefined || p === null ? null : Math.round(p * 100));

const describeOption = (o: Option) => ({
  kind: o.kind,
  dueDate: o.dueDate,
  dueLabel: day(o.dueDate),
  items: o.size,
  confidencePct: pct(o.confidence),
  meetsNeededBy: o.meetsNeededBy,
  pushesBack: o.impacts
    .filter((i) => i.slipDays > 0 || i.confidenceAfter < i.confidenceBefore)
    .map((i) => ({ title: i.title, slipDays: i.slipDays, fromPct: pct(i.confidenceBefore), toPct: pct(i.confidenceAfter) })),
  remainder: o.remainder ? { items: o.remainder.size, dueDate: o.remainder.dueDate, dueLabel: day(o.remainder.dueDate) } : null,
});

const describeNegotiation = (n: Negotiation) => ({
  verdict: n.verdict,
  neededBy: n.neededBy,
  recommended: describeOption(n.recommended),
  options: n.options.map(describeOption),
});

const brief = (c: Commitment, names: Map<string, string>) => ({
  id: c.id,
  title: c.title,
  state: c.state,
  owner: names.get(c.ownerTeamId) ?? c.ownerTeamId,
  requester: names.get(c.requesterTeamId) ?? c.requesterTeamId,
  dueDate: c.terms.dueDate,
  dueLabel: day(c.terms.dueDate),
  neededBy: c.neededBy,
  items: c.terms.size,
  confidencePct: pct(c.confidence),
  proposed: c.pendingTerms ? { dueDate: c.pendingTerms.dueDate, items: c.pendingTerms.size } : null,
  sourceIssueKey: c.sourceIssueKey,
  ownerIssueKey: c.ownerIssueKey ?? null,
});

const names = async (s: ReturnType<typeof scopeFromAction>) => new Map((await syncTeams(s)).map((t) => [t.id, t.name]));

const askInput = (p: ActionPayload) => {
  const sourceIssueKey = issueKeyFrom(p);
  if (!sourceIssueKey) throw invalid('Tell me which work item this ask is for, for example MC-12.');
  const team = str(p.team);
  if (!team) throw invalid('Which team do you need this from?');
  return {
    sourceIssueKey,
    ownerTeamId: team.startsWith('ari:') || team.startsWith('space:') ? team : undefined,
    ownerQuery: team,
    title: str(p.title) || undefined,
    detail: str(p.detail) || undefined,
    neededBy: str(p.neededBy),
    size: num(p.items, 1),
    agentClient: str(p.client) || undefined,
  };
};

export const findTeam = guard('find-team', async (p: ActionPayload, ctx: InvocationContext) => {
  const s = scopeFromAction(p, ctx);
  const teams = (await syncTeams(s)).filter((t) => t.spaceKeys.length > 0);
  const mine = await myTeamIds(s);
  const q = str(p.query);
  const hits = q ? findTeams(teams, q) : teams.filter((t) => mine.includes(t.id));
  return {
    ok: true,
    teams: hits.slice(0, 8).map((t) => ({ id: t.id, name: t.name, spaces: t.spaceKeys, yours: mine.includes(t.id) })),
  };
});

export const draft = guard('draft-ask', async (p: ActionPayload, ctx: InvocationContext) => {
  const s = scopeFromAction(p, ctx);
  const d = await draftAsk(s, askInput(p));
  return {
    ok: true,
    sourceIssue: { key: d.source.key, summary: d.source.summary },
    from: d.requester.name,
    to: d.owner.name,
    otherMatches: d.alternatives.map((t) => t.name),
    title: d.title,
    neededBy: d.neededBy,
    items: d.size,
    goals: d.goals.map((g) => ({ name: g.name, state: g.state ?? null, due: g.dueDate ?? null })),
    forecastBasis: d.model.basis === 'live' ? 'recent throughput' : d.model.basis === 'past' ? `throughput up to ${d.model.windowEnd}` : 'declared capacity',
    ownerPace: `${Math.round(d.model.perWeek * 10) / 10} items a week, about ${Math.round(d.model.askShare * 100)}% of it on asks from other teams`,
    negotiation: describeNegotiation(d.negotiation),
    alreadyAsked: d.duplicateOf ? brief(d.duplicateOf, await names(s)) : null,
    wouldDeadlock: d.cycle,
  };
});

export const raise = guard('raise-ask', async (p: ActionPayload, ctx: InvocationContext) => {
  const s = scopeFromAction(p, ctx);
  const channel = str(p.client) ? 'mcp' : 'rovo';
  const r = await raiseAsk(s, { ...askInput(p), channel });
  return {
    ok: true,
    autoAccepted: r.autoAccepted,
    reusedExisting: !!r.draft.duplicateOf,
    commitment: brief(r.commitment, await names(s)),
    next: r.autoAccepted
      ? `${r.draft.owner.name} auto-accepted this under their team policy.`
      : `${r.draft.owner.name} will see this in their Tether desk with the forecast attached.`,
  };
});

export const desk = guard('team-desk', async (p: ActionPayload, ctx: InvocationContext) => {
  const s = scopeFromAction(p, ctx);
  const teams = await syncTeams(s);
  const mine = await myTeamIds(s);
  const q = str(p.team);
  const team = q ? findTeams(teams, q)[0] : teams.find((t) => mine.includes(t.id));
  if (!team) throw invalid('Which team? I could not tell which one you are on.');
  const v = await deskView(s, team.id);
  return {
    ok: true,
    team: team.name,
    pace: { basis: v.model.basis, itemsPerWeek: v.model.perWeek, askShare: v.model.askShare },
    calibration: v.calibration,
    reliabilityPct: pct(v.reliability),
    waitingForAnswer: v.inbox.map((i) => ({
      id: i.id,
      title: i.title,
      from: i.requester?.name,
      neededBy: i.neededBy,
      items: i.terms.size,
      state: i.state,
      negotiation: i.negotiation ? describeNegotiation(i.negotiation) : null,
    })),
    promised: v.promised.map((c) => ({ id: c.id, title: c.title, to: c.requester?.name, dueDate: c.terms.dueDate, confidencePct: pct(c.confidence), state: c.state })),
    asked: v.asked.map((c) => ({ id: c.id, title: c.title, from: c.owner?.name, dueDate: c.terms.dueDate, confidencePct: pct(c.confidence), state: c.state })),
  };
});

export const status = guard('commitment-status', async (p: ActionPayload, ctx: InvocationContext) => {
  const s = scopeFromAction(p, ctx);
  const id = str(p.commitmentId);
  if (id) {
    const v = await detailView(s, id);
    return {
      ok: true,
      commitment: v.commitment,
      forecast: { probabilityPct: pct(v.forecast.probability), p50: v.forecast.dates.p50, p85: v.forecast.dates.p85, basis: v.forecast.basis, itemsAhead: v.forecast.itemsAhead },
      negotiation: v.negotiation ? describeNegotiation(v.negotiation) : null,
      history: v.history.slice(-8),
    };
  }
  const key = issueKeyFrom(p);
  if (!key) throw invalid('Give me a work item key or a commitment id.');
  const v = await panelView(s, key);
  return {
    ok: true,
    issue: v.issue,
    waitingOn: v.waitingOn,
    promisedTo: v.promisedTo,
    readiness: v.readiness ? { p50: v.readiness.p50, p85: v.readiness.p85, dependencies: v.readiness.dependencies } : null,
  };
});

const termsFrom = (p: ActionPayload, c: Commitment) => {
  const dueDate = str(p.dueDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw invalid('Give a date like 2026-12-11.');
  return { dueDate, scope: str(p.scope) || c.terms.scope, size: Math.max(1, Math.round(num(p.items, c.terms.size))) };
};

const load = async (p: ActionPayload) => {
  const c = await getCommitment(str(p.commitmentId));
  if (!c) throw invalid('I could not find that commitment. Use commitment-status to look it up first.');
  return c;
};

export const propose = guard('propose-terms', async (p: ActionPayload, ctx: InvocationContext) => {
  const s = scopeFromAction(p, ctx);
  const c = await load(p);
  const terms = termsFrom(p, c);
  const reason = str(p.reason) || undefined;
  const action =
    c.state === 'proposed'
      ? ({ kind: 'counter', terms, reason } as const)
      : c.state === 'countered'
        ? ({ kind: 'repropose', terms, reason } as const)
        : ({ kind: 'renegotiate', terms, reason: reason ?? 'New terms proposed' } as const);
  const next = await actAsUser(s, c.id, action);
  return { ok: true, commitment: brief(next, await names(s)) };
});

export const accept = guard('accept-commitment', async (p: ActionPayload, ctx: InvocationContext) => {
  const s = scopeFromAction(p, ctx);
  const c = await load(p);
  const kind = c.state === 'renegotiating' ? 'acceptRenegotiation' : 'accept';
  const next = await actAsUser(s, c.id, { kind }, c.state === 'countered' || c.state === 'renegotiating' ? 'requester' : 'owner');
  return { ok: true, commitment: brief(next, await names(s)), ownerIssueKey: next.ownerIssueKey ?? null };
});

export const decline = guard('decline-ask', async (p: ActionPayload, ctx: InvocationContext) => {
  const s = scopeFromAction(p, ctx);
  const c = await load(p);
  const reason = str(p.reason);
  if (!reason) throw invalid('Say why, so the other team can plan around it.');
  const next = await actAsUser(s, c.id, { kind: 'decline', reason }, 'owner');
  return { ok: true, commitment: brief(next, await names(s)) };
});

export const whatIf = guard('slip-impact', async (p: ActionPayload, ctx: InvocationContext) => {
  const s = scopeFromAction(p, ctx);
  const c = await load(p);
  const newDate = str(p.newDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) throw invalid('Give the new date like 2026-12-18.');
  const open = (await openCommitments()).filter((x) => isOpen(x.state));
  const shifted = open;
  const graph = await graphFor(shifted);
  const models = new Map<string, TeamModel>();
  for (const id of new Set(shifted.map((x) => x.ownerTeamId))) {
    const t = await getTeam(id);
    if (!t) continue;
    const m = await loadModel(t);
    models.set(id, { policy: m.policy, throughput: m.throughput });
  }
  const before = replan(open, await graphFor(open), models, toDay(todayIso()), `${todayIso()}:base`);
  const after = replan(shifted, graph, models, toDay(todayIso()), `${todayIso()}:what-if`, new Map([[c.id, toDay(newDate)]]));
  const downstream = reachDownstream(graph, c.id);
  const byId = new Map(open.map((x) => [x.id, x]));
  const n = await names(s);
  return {
    ok: true,
    moving: brief(c, n),
    to: newDate,
    affected: downstream.map((id) => ({
      title: byId.get(id)?.title,
      owner: n.get(byId.get(id)?.ownerTeamId ?? ''),
      dueDate: byId.get(id)?.terms.dueDate,
      fromPct: pct(before.get(id)?.confidence),
      toPct: pct(after.get(id)?.confidence),
    })),
    nothingDownstream: downstream.length === 0,
  };
});

export const mine = guard('my-commitments', async (p: ActionPayload, ctx: InvocationContext) => {
  const s = scopeFromAction(p, ctx);
  const n = await names(s);
  const key = issueKeyFrom(p);
  const pool = key ? await touchingIssues([key]) : await openCommitments();
  const ids = await access(s).acting(pool.flatMap((c) => [c.ownerTeamId, c.requesterTeamId]));
  const rows = pool.filter((c) => ids.includes(c.ownerTeamId) || ids.includes(c.requesterTeamId));
  return {
    ok: true,
    yourTeams: ids.map((id) => n.get(id) ?? id),
    weOwe: rows.filter((c) => ids.includes(c.ownerTeamId)).map((c) => brief(c, n)),
    weAreWaitingOn: rows.filter((c) => ids.includes(c.requesterTeamId)).map((c) => brief(c, n)),
  };
});

export const withdraw = guard('withdraw-ask', async (p: ActionPayload, ctx: InvocationContext) => {
  const s = scopeFromAction(p, ctx);
  const c = await load(p);
  const next = await actAsUser(s, c.id, { kind: 'withdraw', reason: str(p.reason) || undefined }, 'requester');
  return { ok: true, commitment: brief(next, await names(s)) };
});

export const policy = guard('update-team-policy', async (p: ActionPayload, ctx: InvocationContext) => {
  const s = scopeFromAction(p, ctx);
  const teams = await syncTeams(s);
  const team = findTeams(teams.filter((t) => t.spaceKeys.length), str(p.team))[0];
  if (!team) throw invalid('Which team? Give its name or space key.');
  if (!(await access(s).canActFor(team))) throw invalid(`Only people who can work in ${team.name}'s space can change its policy.`);
  const cur = await getPolicy(team.id);
  const pctOr = (v: unknown, d: number) => (v === undefined || v === '' ? d : num(v, d * 100) / 100);
  const next = {
    ...cur,
    askShare: pctOr(p.askSharePct, cur.askShare),
    declaredDailyCapacity: p.weeklyCapacity === undefined || p.weeklyCapacity === '' ? cur.declaredDailyCapacity : num(p.weeklyCapacity, cur.declaredDailyCapacity * 5) / 5,
    targetConfidence: pctOr(p.promiseAtPct, cur.targetConfidence),
    riskThreshold: pctOr(p.atRiskBelowPct, cur.riskThreshold),
  };
  const saved = await savePolicy(next, s.accountId ?? 'agent');
  if (!saved) throw invalid('Someone changed this policy a moment ago. Try again.');
  await forgetThroughput(team.id);
  await enqueue({ kind: 'replan', reason: 'policy', teams: [team.id] }, 2);
  return {
    ok: true,
    team: team.name,
    policy: {
      askSharePct: Math.round(saved.askShare * 100),
      weeklyCapacity: Math.round(saved.declaredDailyCapacity * 5 * 10) / 10,
      promiseAtPct: Math.round(saved.targetConfidence * 100),
      atRiskBelowPct: Math.round(saved.riskThreshold * 100),
    },
    note: 'Forecasts for this team update within a minute.',
  };
});
