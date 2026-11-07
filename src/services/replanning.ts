import { isOpen, isPending } from '../domain/commitment';
import type { Commitment } from '../domain/types';
import { toDay } from '../engine/forecast/calendar';
import { replan, toQueueItem, type TeamModel } from '../engine/propagate/replan';
import { asApp } from '../jira/client';
import { getIssues } from '../jira/issues';
import { log, nowIso, round, todayIso } from '../lib/util';
import { getCommitment, openCommitments, setConfidence } from '../store/commitments';
import { getTeam, latestInputs, saveSnapshot } from '../store/records';
import { graphFor } from './asks';
import { negotiateFor } from './forecasting';
import { apply } from './lifecycle';
import { loadModel, type TeamModelView } from './model';
import { broadcast, day, tellEscalation } from './notify';
import { causes, decide, inputsOf, type Inputs } from './diagnose';
import type { Scope } from './scope';

const SYSTEM = { side: 'system' as const, agent: 'tether' };
const QUIET = { replan: false };

const deliverFinished = async (s: Scope, active: Commitment[]) => {
  const keys = active.map((c) => c.ownerIssueKey).filter((k): k is string => !!k);
  if (!keys.length) return new Set<string>();
  const issues = await getIssues(asApp, keys);
  const done = new Set(issues.filter((i) => i.statusCategory === 'done').map((i) => i.key));
  const delivered = new Set<string>();
  for (const c of active) {
    if (!c.ownerIssueKey || !done.has(c.ownerIssueKey)) continue;
    try {
      await apply(s, c.id, { kind: 'deliver', at: nowIso() }, SYSTEM, `${c.ownerIssueKey} moved to done`, QUIET);
      delivered.add(c.id);
    } catch (e) {
      log('deliver.failed', { id: c.id, message: (e as Error).message });
    }
  }
  return delivered;
};

const loadModels = async (teamIds: string[]) => {
  const views = new Map<string, TeamModelView>();
  for (const id of new Set(teamIds)) {
    const team = await getTeam(id);
    if (!team) continue;
    try {
      views.set(id, await loadModel(team));
    } catch (e) {
      log('model.failed', { team: id, message: (e as Error).message });
    }
  }
  return views;
};

const pct = (p: number) => `${Math.round(p * 100)}%`;

export const replanAll = async (s: Scope, reason: string) => {
  const started = Date.now();
  const all = await openCommitments();
  const active = all.filter((c) => isOpen(c.state));
  const delivered = await deliverFinished(s, active);
  const live = active.filter((c) => !delivered.has(c.id));

  const views = await loadModels(all.map((c) => c.ownerTeamId));
  const models = new Map<string, TeamModel>([...views].map(([id, v]) => [id, { policy: v.policy, throughput: v.throughput }]));
  const graph = await graphFor(live);
  const results = replan(live, graph, models, toDay(todayIso()), todayIso());
  const byId = new Map(live.map((c) => [c.id, c]));

  let moved = 0;
  const today = toDay(todayIso());
  const ownerIssues = new Map(
    (await getIssues(asApp, live.map((c) => c.ownerIssueKey).filter((k): k is string => !!k))).map((i) => [i.key, i]),
  );
  for (const r of results.values()) {
    const c = byId.get(r.id)!;
    const model = views.get(c.ownerTeamId);
    const now = inputsOf(r.result);
    const before = await latestInputs<Inputs>(c.id);
    await setConfidence(c.id, round(r.confidence, 4));
    await saveSnapshot({
      commitmentId: c.id,
      takenOn: todayIso(),
      probability: round(r.confidence, 4),
      p50: r.result.dates.p50,
      p85: r.result.dates.p85,
      basis: model?.basis ?? 'declared',
      inputs: now,
    });
    if (!r.move) {
      if (Math.abs((r.previous ?? r.confidence) - r.confidence) >= 0.05) await broadcast({ ...c, confidence: r.confidence }, 'forecast');
      continue;
    }
    moved++;
    try {
      if (r.move === 'breach') {
        await apply(s, c.id, { kind: 'breach' }, SYSTEM, `Due ${day(c.terms.dueDate)} passed without delivery`, QUIET);
        continue;
      }
      if (r.move === 'recover') {
        await apply(s, c.id, { kind: 'recover', confidence: r.confidence }, SYSTEM, `Back to ${pct(r.confidence)}`, QUIET);
        continue;
      }
      if (!model) continue;
      const owner = model.team;
      const drag = r.upstreamIds
        .map((u) => byId.get(u))
        .filter((u): u is Commitment => !!u && (results.get(u.id)?.confidence ?? 1) < model.policy.riskThreshold + 0.05)
        .map((u) => ({ title: u.title, confidence: results.get(u.id)!.confidence }));
      const ownerIssue = c.ownerIssueKey ? ownerIssues.get(c.ownerIssueKey) ?? null : null;
      const why = causes({ ...c, confidence: r.confidence }, owner, now, before, drag, ownerIssue, today);
      await apply(s, c.id, { kind: 'slip', confidence: r.confidence }, SYSTEM, why.join(' '), QUIET);
      const fresh = await getCommitment(c.id);
      if (!fresh || fresh.state !== 'at_risk') continue;
      const decision = decide(fresh, await negotiateFor(toQueueItem(fresh), model, fresh.id));
      if (decision.kind === 'propose') {
        const o = decision.option;
        await apply(
          s,
          fresh.id,
          { kind: 'renegotiate', terms: { dueDate: o.dueDate, scope: fresh.terms.scope, size: o.size, confidence: round(o.confidence, 4) }, reason: why.join(' ') },
          SYSTEM,
          undefined,
          QUIET,
        );
      } else if (decision.kind === 'escalate') {
        const requester = await getTeam(fresh.requesterTeamId);
        await tellEscalation(asApp, fresh, owner, requester?.name ?? 'the asking team', why, decision);
      }
    } catch (e) {
      log('replan.move_failed', { id: c.id, move: r.move, message: (e as Error).message });
    }
  }

  for (const c of all.filter((x) => isPending(x.state))) {
    const model = views.get(c.ownerTeamId);
    if (!model) continue;
    try {
      const n = await negotiateFor(toQueueItem(c), model, c.id);
      await setConfidence(c.id, round(n.options[0].confidence, 4));
    } catch (e) {
      log('pending.forecast_failed', { id: c.id, message: (e as Error).message });
    }
  }

  log('replan.done', { reason, open: all.length, active: live.length, delivered: delivered.size, moved, ms: Date.now() - started, cycles: graph.cycles.length });
  return { open: all.length, delivered: delivered.size, moved };
};
