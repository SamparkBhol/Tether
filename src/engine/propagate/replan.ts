import type { Commitment, TeamPolicy } from '../../domain/types';
import { isOpen } from '../../domain/commitment';
import { toDay } from '../forecast/calendar';
import { simulate, type SimulationResult } from '../forecast/montecarlo';
import { hashSeed } from '../forecast/random';
import type { ThroughputSample } from '../forecast/throughput';
import { sizeAhead, type QueueItem } from '../negotiate/queue';
import type { CommitmentGraph } from './graph';

export interface TeamModel {
  policy: TeamPolicy;
  throughput: ThroughputSample | null;
}

export type Move = 'slip' | 'recover' | 'breach' | null;

export interface Replanned {
  id: string;
  result: SimulationResult;
  confidence: number;
  previous?: number;
  move: Move;
  upstreamIds: string[];
}

const HYSTERESIS = 0.05;
const INTEGRATION_LAG = 2;

export const toQueueItem = (c: Commitment): QueueItem => ({
  id: c.id,
  title: c.title,
  size: c.terms.size,
  dueDate: c.terms.dueDate,
  goalWeight: c.goalWeight,
  createdAt: c.createdAt,
  requesterTeamId: c.requesterTeamId,
});

export const decideMove = (c: Commitment, confidence: number, today: number, threshold: number): Move => {
  if (!isOpen(c.state)) return null;
  if (toDay(c.terms.dueDate) < today) return 'breach';
  if (c.state === 'committed' && confidence < threshold) return 'slip';
  if (c.state === 'at_risk' && confidence >= threshold + HYSTERESIS) return 'recover';
  return null;
};

const maxSamples = (sets: Int32Array[]): Int32Array | undefined => {
  if (!sets.length) return undefined;
  const n = Math.min(...sets.map((s) => s.length));
  const out = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    let m = sets[0][i];
    for (let s = 1; s < sets.length; s++) if (sets[s][i] > m) m = sets[s][i];
    out[i] = m;
  }
  return out;
};

export const replan = (
  commitments: Commitment[],
  graph: CommitmentGraph,
  models: Map<string, TeamModel>,
  today: number,
  dayKey: string,
): Map<string, Replanned> => {
  const byId = new Map(commitments.map((c) => [c.id, c]));
  const queues = new Map<string, QueueItem[]>();
  for (const c of commitments) {
    if (!isOpen(c.state)) continue;
    queues.set(c.ownerTeamId, [...(queues.get(c.ownerTeamId) ?? []), toQueueItem(c)]);
  }

  const out = new Map<string, Replanned>();
  for (const id of graph.order) {
    const c = byId.get(id);
    if (!c || !isOpen(c.state)) continue;
    const model = models.get(c.ownerTeamId);
    if (!model) continue;
    const upstreamIds = (graph.upstreamOf.get(id) ?? []).filter((u) => out.has(u));
    const gate = maxSamples(upstreamIds.map((u) => out.get(u)!.result.samples));
    const dueDay = toDay(c.terms.dueDate);
    const result = simulate({
      today,
      calendar: model.policy,
      throughput: model.throughput,
      declaredDailyCapacity: model.policy.declaredDailyCapacity,
      askShare: model.policy.askShare,
      itemsAhead: sizeAhead(queues.get(c.ownerTeamId) ?? [], toQueueItem(c)),
      size: c.terms.size,
      dueDay,
      upstream: gate ? { samples: gate, lagDays: INTEGRATION_LAG } : undefined,
      seed: hashSeed(c.id, dayKey.slice(0, 10)),
    });
    out.set(id, {
      id,
      result,
      confidence: result.probabilityByDue,
      previous: c.confidence,
      move: decideMove(c, result.probabilityByDue, today, model.policy.riskThreshold),
      upstreamIds,
    });
  }
  return out;
};
