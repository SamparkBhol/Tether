export interface Outcome {
  predicted: number;
  hit: boolean;
}

export interface Calibration {
  samples: number;
  brier: number | null;
  hitRate: number | null;
  meanPredicted: number | null;
  verdict: 'learning' | 'honest' | 'optimistic' | 'pessimistic';
}

export const calibrate = (outcomes: Outcome[]): Calibration => {
  const n = outcomes.length;
  if (n < 5) return { samples: n, brier: null, hitRate: null, meanPredicted: null, verdict: 'learning' };
  const brier = outcomes.reduce((s, o) => s + (o.predicted - (o.hit ? 1 : 0)) ** 2, 0) / n;
  const hitRate = outcomes.filter((o) => o.hit).length / n;
  const meanPredicted = outcomes.reduce((s, o) => s + o.predicted, 0) / n;
  const gap = meanPredicted - hitRate;
  const verdict = Math.abs(gap) <= 0.1 ? 'honest' : gap > 0 ? 'optimistic' : 'pessimistic';
  return { samples: n, brier, hitRate, meanPredicted, verdict };
};

export const reliability = (delivered: { onTime: boolean }[]) => {
  if (!delivered.length) return null;
  return delivered.filter((d) => d.onTime).length / delivered.length;
};
