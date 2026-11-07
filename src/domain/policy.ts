import type { TeamPolicy } from './types';

export const defaultPolicy = (teamId: string): TeamPolicy => ({
  teamId,
  riskThreshold: 0.6,
  targetConfidence: 0.85,
  askShare: 0.35,
  declaredDailyCapacity: 1,
  autoAcceptMaxSize: 0,
  autoAcceptGoalAligned: true,
  nonWorkingDates: [],
  workingWeekdays: [1, 2, 3, 4, 5],
  version: 1,
});

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const normalisePolicy = (p: Partial<TeamPolicy> & { teamId: string }): TeamPolicy => {
  const base = defaultPolicy(p.teamId);
  const merged = { ...base, ...p };
  const weekdays = (merged.workingWeekdays ?? base.workingWeekdays).filter((d) => d >= 0 && d <= 6);
  return {
    ...merged,
    riskThreshold: clamp(merged.riskThreshold, 0.3, 0.95),
    targetConfidence: clamp(merged.targetConfidence, 0.5, 0.99),
    askShare: clamp(merged.askShare, 0.05, 1),
    declaredDailyCapacity: clamp(merged.declaredDailyCapacity, 0.1, 50),
    autoAcceptMaxSize: clamp(Math.round(merged.autoAcceptMaxSize), 0, 10),
    workingWeekdays: weekdays.length ? weekdays : base.workingWeekdays,
    nonWorkingDates: [...new Set(merged.nonWorkingDates ?? [])].sort(),
  };
};
