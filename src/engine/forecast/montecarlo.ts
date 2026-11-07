import { fromDay, workingDayTest, type WorkCalendar } from './calendar';
import { poisson, seeded, type Rng } from './random';
import type { ThroughputSample } from './throughput';

export interface SimulationInput {
  today: number;
  calendar: WorkCalendar;
  throughput: ThroughputSample | null;
  declaredDailyCapacity: number;
  askShare: number;
  itemsAhead: number;
  size: number;
  dueDay: number;
  upstream?: { samples: Int32Array; lagDays: number };
  seed: number;
  trials?: number;
}

export interface SimulationResult {
  basis: 'history' | 'declared';
  trials: number;
  samples: Int32Array;
  probabilityByDue: number;
  percentile: (q: number) => number;
  dates: { p50: string; p70: string; p85: string; p95: string };
  curve: { date: string; probability: number }[];
  histogram: { date: string; share: number }[];
  inputs: { perDay: number; askShare: number; itemsAhead: number; size: number; basis: 'history' | 'declared'; days: number };
  beyondHorizon: number;
}

const HORIZON = 260;

const binomial = (rng: Rng, n: number, p: number) => {
  let k = 0;
  for (let i = 0; i < n; i++) if (rng() < p) k++;
  return k;
};

const dailyDraw = (input: SimulationInput, rng: Rng): (() => number) => {
  const t = input.throughput;
  if (t && t.counts.length) {
    const counts = t.counts;
    return () => binomial(rng, counts[Math.floor(rng() * counts.length)], input.askShare);
  }
  const mean = input.declaredDailyCapacity * input.askShare;
  return () => poisson(rng, mean);
};

export const simulate = (input: SimulationInput): SimulationResult => {
  const trials = input.trials ?? 2000;
  const rng = seeded(input.seed);
  const draw = dailyDraw(input, rng);
  const isWorking = workingDayTest(input.calendar);
  const advance = (start: number, n: number) => {
    let d = start;
    for (let left = n; left > 0; ) if (isWorking(++d)) left--;
    return d;
  };
  const samples = new Int32Array(trials);
  const work = Math.max(1, input.itemsAhead + input.size);
  let beyond = 0;

  for (let i = 0; i < trials; i++) {
    let remaining = work;
    let day = input.today;
    let steps = 0;
    while (remaining > 0 && steps < HORIZON) {
      day++;
      if (!isWorking(day)) continue;
      steps++;
      remaining -= draw();
    }
    if (remaining > 0) beyond++;
    if (input.upstream) {
      const gate = advance(input.upstream.samples[i % input.upstream.samples.length], input.upstream.lagDays);
      if (gate > day) day = gate;
    }
    samples[i] = day;
  }

  const sorted = Int32Array.from(samples).sort();
  const percentile = (q: number) => sorted[Math.min(trials - 1, Math.max(0, Math.ceil(q * trials) - 1))];
  let onTime = 0;
  for (const d of sorted) if (d <= input.dueDay) onTime++;

  const first = sorted[0];
  const last = percentile(0.98);
  const stride = Math.max(1, Math.ceil((last - first) / 40));
  const curve: { date: string; probability: number }[] = [];
  let j = 0;
  for (let d = first; d <= last; d += stride) {
    while (j < trials && sorted[j] <= d) j++;
    curve.push({ date: fromDay(d), probability: j / trials });
  }

  const week = 7;
  const histogram: { date: string; share: number }[] = [];
  for (let start = first, k = 0; start <= last; start += week) {
    let n = 0;
    while (k < trials && sorted[k] < start + week) {
      n++;
      k++;
    }
    histogram.push({ date: fromDay(start), share: n / trials });
  }
  const t = input.throughput;
  const perDay = t && t.counts.length ? t.total / t.counts.length : input.declaredDailyCapacity;
  const basis: 'history' | 'declared' = t && t.counts.length ? 'history' : 'declared';

  return {
    basis,
    trials,
    samples,
    probabilityByDue: onTime / trials,
    percentile,
    dates: {
      p50: fromDay(percentile(0.5)),
      p70: fromDay(percentile(0.7)),
      p85: fromDay(percentile(0.85)),
      p95: fromDay(percentile(0.95)),
    },
    curve,
    histogram,
    inputs: { perDay, askShare: input.askShare, itemsAhead: input.itemsAhead, size: input.size, basis, days: t?.counts.length ?? 0 },
    beyondHorizon: beyond / trials,
  };
};

export const earliestDayAt = (r: SimulationResult, confidence: number) => r.percentile(confidence);
