import type { Commitment } from '../domain/types';
import { isOpen } from '../domain/commitment';
import { toDay } from '../engine/forecast/calendar';
import { simulate, type SimulationResult } from '../engine/forecast/montecarlo';
import { hashSeed } from '../engine/forecast/random';
import { negotiate, type Forecaster, type Negotiation } from '../engine/negotiate/options';
import { sizeAhead, type QueueItem } from '../engine/negotiate/queue';
import { toQueueItem } from '../engine/propagate/replan';
import { todayIso } from '../lib/util';
import { forOwner } from '../store/commitments';
import type { TeamModelView } from './model';

export const ownerQueue = async (teamId: string, exceptId?: string): Promise<QueueItem[]> =>
  (await forOwner(teamId, 300)).filter((c) => isOpen(c.state) && c.id !== exceptId).map(toQueueItem);

export const forecaster = (model: TeamModelView, key: string): Forecaster => {
  const today = toDay(todayIso());
  return (itemsAhead, size, dueDay, salt, askShare) =>
    simulate({
      today,
      calendar: model.policy,
      throughput: model.throughput,
      declaredDailyCapacity: model.policy.declaredDailyCapacity,
      askShare: askShare ?? model.policy.askShare,
      itemsAhead,
      size,
      dueDay,
      seed: hashSeed(key, salt, todayIso()),
    });
};

export const commitmentSeed = (id: string) => hashSeed(id, todayIso());

export const forecastCommitment = async (c: Commitment, model: TeamModelView): Promise<SimulationResult> => {
  const queue = await ownerQueue(c.ownerTeamId, c.id);
  return simulate({
    today: toDay(todayIso()),
    calendar: model.policy,
    throughput: model.throughput,
    declaredDailyCapacity: model.policy.declaredDailyCapacity,
    askShare: model.policy.askShare,
    itemsAhead: sizeAhead(queue, toQueueItem(c)),
    size: c.terms.size,
    dueDay: toDay(c.terms.dueDate),
    seed: commitmentSeed(c.id),
  });
};

export const negotiateFor = async (
  item: QueueItem,
  model: TeamModelView,
  exceptId?: string,
): Promise<Negotiation> => {
  const queue = await ownerQueue(model.team.id, exceptId);
  return negotiate({
    ask: item,
    queue,
    forecast: forecaster(model, item.id),
    targetConfidence: model.policy.targetConfidence,
    riskThreshold: model.policy.riskThreshold,
    askShare: model.policy.askShare,
    today: toDay(todayIso()),
  });
};
