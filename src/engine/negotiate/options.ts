import { fromDay, toDay } from '../forecast/calendar';
import type { SimulationResult } from '../forecast/montecarlo';
import { insertAt, ordered, placedBefore, sizeAhead, type QueueItem } from './queue';

export type OptionKind = 'as_asked' | 'later_date' | 'jump_queue' | 'split_scope' | 'make_room';

export interface Impact {
  commitmentId: string;
  title: string;
  requesterTeamId: string;
  confidenceBefore: number;
  confidenceAfter: number;
  slipDays: number;
}

export interface Option {
  kind: OptionKind;
  dueDate: string;
  size: number;
  confidence: number;
  confidenceByNeeded: number;
  meetsNeededBy: boolean;
  impacts: Impact[];
  remainder?: { size: number; dueDate: string; confidence: number };
  askShare?: { from: number; to: number; weeks: number };
  score: number;
}

export interface Negotiation {
  neededBy: string;
  options: Option[];
  recommended: Option;
  verdict: 'easy' | 'tight' | 'needs_tradeoff' | 'later' | 'not_this_quarter';
  curve: { date: string; probability: number }[];
  histogram: { date: string; share: number }[];
  inputs: SimulationResult['inputs'];
  basis: 'history' | 'declared';
}

export type Forecaster = (itemsAhead: number, size: number, dueDay: number, salt: string, askShare?: number) => SimulationResult;

export interface NegotiationInput {
  ask: QueueItem;
  queue: QueueItem[];
  forecast: Forecaster;
  targetConfidence: number;
  riskThreshold: number;
  askShare: number;
  today: number;
}

const calendarGap = (a: string, b: string) => toDay(a) - toDay(b);

const score = (o: Omit<Option, 'score'>, neededBy: string) => {
  const late = Math.max(0, calendarGap(o.dueDate, neededBy));
  const harm = o.impacts.reduce((s, i) => s + i.slipDays + Math.max(0, i.confidenceBefore - i.confidenceAfter) * 20, 0);
  const partial = o.remainder ? 12 + o.remainder.size * 4 : 0;
  const effort = o.askShare ? (o.askShare.to - o.askShare.from) * 60 : 0;
  return (o.meetsNeededBy ? 100 : 0) + o.confidence * 20 - late * 3 - harm - partial - effort;
};

const finish = (o: Omit<Option, 'score'>, neededBy: string): Option => ({ ...o, score: score(o, neededBy) });

export const negotiate = (input: NegotiationInput): Negotiation => {
  const { ask, queue, forecast, targetConfidence, riskThreshold, askShare, today } = input;
  const neededDay = toDay(ask.dueDate);
  const options: Option[] = [];

  const ahead = sizeAhead(queue, ask);
  const asAsked = forecast(ahead, ask.size, neededDay, 'as_asked');
  options.push(
    finish(
      {
        kind: 'as_asked',
        dueDate: ask.dueDate,
        size: ask.size,
        confidence: asAsked.probabilityByDue,
        confidenceByNeeded: asAsked.probabilityByDue,
        meetsNeededBy: true,
        impacts: [],
      },
      ask.dueDate,
    ),
  );

  if (asAsked.probabilityByDue < targetConfidence) {
    const laterDay = asAsked.percentile(targetConfidence);
    const moved = { ...ask, dueDate: fromDay(laterDay) };
    const relocated = forecast(sizeAhead(queue, moved), ask.size, laterDay, 'later');
    const day = Math.max(laterDay, relocated.percentile(targetConfidence));
    options.push(
      finish(
        {
          kind: 'later_date',
          dueDate: fromDay(day),
          size: ask.size,
          confidence: targetConfidence,
          confidenceByNeeded: asAsked.probabilityByDue,
          meetsNeededBy: false,
          impacts: [],
        },
        ask.dueDate,
      ),
    );

    const sorted = ordered(queue);
    const naturalPos = insertAt(queue, ask);
    const candidates = sorted
      .slice(0, naturalPos)
      .filter((q) => q.goalWeight < ask.goalWeight)
      .slice(-4);
    for (const target of candidates) {
      const pos = placedBefore(queue, ask, target.id);
      const jumped = forecast(sizeAhead(queue, ask, pos), ask.size, neededDay, `jump:${target.id}`);
      const displaced = sorted.slice(pos, naturalPos);
      const impacts: Impact[] = displaced.map((d) => {
        const dDay = toDay(d.dueDate);
        const beforeAhead = sizeAhead(queue, d);
        const before = forecast(beforeAhead, d.size, dDay, `before:${d.id}`);
        const after = forecast(beforeAhead + ask.size, d.size, dDay, `after:${d.id}`);
        return {
          commitmentId: d.id,
          title: d.title,
          requesterTeamId: d.requesterTeamId,
          confidenceBefore: before.probabilityByDue,
          confidenceAfter: after.probabilityByDue,
          slipDays: Math.max(0, after.percentile(targetConfidence) - before.percentile(targetConfidence)),
        };
      });
      if (impacts.some((i) => i.confidenceAfter < riskThreshold && i.confidenceBefore >= riskThreshold)) continue;
      options.push(
        finish(
          {
            kind: 'jump_queue',
            dueDate: ask.dueDate,
            size: ask.size,
            confidence: jumped.probabilityByDue,
            confidenceByNeeded: jumped.probabilityByDue,
            meetsNeededBy: true,
            impacts,
          },
          ask.dueDate,
        ),
      );
    }

    for (let share = Math.round((askShare + 0.05) * 20) / 20; share <= 0.8 + 1e-9; share = Math.round((share + 0.05) * 20) / 20) {
      const boosted = forecast(ahead, ask.size, neededDay, `room:${share}`, share);
      if (boosted.probabilityByDue < targetConfidence) continue;
      options.push(
        finish(
          {
            kind: 'make_room',
            dueDate: ask.dueDate,
            size: ask.size,
            confidence: boosted.probabilityByDue,
            confidenceByNeeded: boosted.probabilityByDue,
            meetsNeededBy: true,
            impacts: [],
            askShare: { from: askShare, to: share, weeks: Math.max(1, Math.ceil((neededDay - today) / 7)) },
          },
          ask.dueDate,
        ),
      );
      break;
    }

    if (ask.size > 1) {
      for (let k = ask.size - 1; k >= 1; k--) {
        const part = forecast(ahead, k, neededDay, `split:${k}`);
        if (part.probabilityByDue < targetConfidence) continue;
        const rest = forecast(ahead, ask.size, neededDay, 'split:rest');
        const restDay = rest.percentile(targetConfidence);
        options.push(
          finish(
            {
              kind: 'split_scope',
              dueDate: ask.dueDate,
              size: k,
              confidence: part.probabilityByDue,
              confidenceByNeeded: part.probabilityByDue,
              meetsNeededBy: true,
              impacts: [],
              remainder: { size: ask.size - k, dueDate: fromDay(restDay), confidence: targetConfidence },
            },
            ask.dueDate,
          ),
        );
        break;
      }
    }
  }

  const p = asAsked.probabilityByDue;
  const viable = options.filter((o) => o.kind !== 'as_asked' && o.confidence >= targetConfidence);
  const recommended =
    p >= targetConfidence ? options[0] : ([...viable].sort((a, b) => b.score - a.score)[0] ?? options[options.length - 1]);
  const verdict: Negotiation['verdict'] =
    p >= targetConfidence
      ? 'easy'
      : p >= riskThreshold
        ? 'tight'
        : recommended.meetsNeededBy
          ? 'needs_tradeoff'
          : calendarGap(recommended.dueDate, ask.dueDate) > 60
            ? 'not_this_quarter'
            : 'later';

  return { neededBy: ask.dueDate, options, recommended, verdict, curve: asAsked.curve, histogram: asAsked.histogram, inputs: asAsked.inputs, basis: asAsked.basis };
};
