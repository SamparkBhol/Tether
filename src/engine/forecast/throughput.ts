import { toDay, workingDaysInWindow, type WorkCalendar } from './calendar';

export interface ThroughputSample {
  days: number[];
  counts: number[];
  total: number;
  activeDays: number;
}

export interface ThroughputSummary {
  windowDays: number;
  completed: number;
  perWeek: number;
  zeroDayShare: number;
  enoughHistory: boolean;
}

export const MIN_COMPLETIONS = 8;
export const WINDOW_DAYS = 60;

export const sampleThroughput = (
  resolvedAt: string[],
  cal: WorkCalendar,
  today: number,
  windowDays = WINDOW_DAYS,
): ThroughputSample => {
  const days = workingDaysInWindow(cal, today - 1, windowDays);
  const index = new Map(days.map((d, i) => [d, i]));
  const counts = new Array<number>(days.length).fill(0);
  for (const at of resolvedAt) {
    const i = index.get(toDay(at));
    if (i !== undefined) counts[i]++;
  }
  const firstActive = counts.findIndex((c) => c > 0);
  const trimmedDays = firstActive > 0 ? days.slice(firstActive) : days;
  const trimmedCounts = firstActive > 0 ? counts.slice(firstActive) : counts;
  return {
    days: trimmedDays,
    counts: trimmedCounts,
    total: trimmedCounts.reduce((a, b) => a + b, 0),
    activeDays: trimmedCounts.length,
  };
};

export const summarise = (s: ThroughputSample): ThroughputSummary => ({
  windowDays: s.activeDays,
  completed: s.total,
  perWeek: s.activeDays ? (s.total / s.activeDays) * 5 : 0,
  zeroDayShare: s.activeDays ? s.counts.filter((c) => c === 0).length / s.activeDays : 1,
  enoughHistory: s.total >= MIN_COMPLETIONS && s.activeDays >= 10,
});
