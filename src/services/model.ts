import { kvs } from '@forge/kvs';
import type { Team, TeamPolicy } from '../domain/types';
import { fromDay, toDay } from '../engine/forecast/calendar';
import { sampleThroughput, summarise, type ThroughputSample, type ThroughputSummary } from '../engine/forecast/throughput';
import { completions } from '../jira/issues';
import { asApp } from '../jira/client';
import { kvKey, todayIso } from '../lib/util';
import { getPolicy } from '../store/records';

export type Basis = 'live' | 'past' | 'declared';

export interface TeamModelView {
  team: Team;
  policy: TeamPolicy;
  throughput: ThroughputSample | null;
  basis: Basis;
  windowEnd?: string;
  summary: ThroughputSummary;
  shareSource: 'learned' | 'policy';
  learnedFrom: number;
}

const cacheKey = (teamId: string) => kvKey('throughput', teamId);
const STALE_AFTER_DAYS = 21;

const completionDates = async (team: Team): Promise<string[]> => {
  const key = cacheKey(team.id);
  const cached = await kvs.get<string[]>(key);
  if (cached) return cached;
  const dates = await completions(asApp, team.spaceKeys, 400);
  await kvs.set(key, dates, { ttl: { value: 6, unit: 'HOURS' } });
  return dates;
};

export const forgetThroughput = (teamId: string) => kvs.delete(cacheKey(teamId));

const learnedShare = async (team: Team, total: number) => {
  const key = kvKey('asks-done', team.id);
  let done = await kvs.get<number>(key);
  if (done === undefined) {
    done = (await completions(asApp, team.spaceKeys, 200, 'tether')).length;
    await kvs.set(key, done, { ttl: { value: 6, unit: 'HOURS' } });
  }
  return done >= 8 && total > 0 ? { share: Math.min(0.9, Math.max(0.05, done / total)), from: done } : null;
};

export const loadModel = async (team: Team): Promise<TeamModelView> => {
  const stated = await getPolicy(team.id);
  const dates = await completionDates(team);
  const learned = await learnedShare(team, dates.length);
  const policy = learned ? { ...stated, askShare: learned.share } : stated;
  const extra = { shareSource: (learned ? 'learned' : 'policy') as 'learned' | 'policy', learnedFrom: learned?.from ?? 0 };
  const today = toDay(todayIso());
  const live = sampleThroughput(dates, policy, today);
  const liveSummary = summarise(live);
  if (liveSummary.enoughHistory) return { team, policy, throughput: live, basis: 'live', summary: liveSummary, ...extra };

  const latest = dates.length ? Math.max(...dates.map(toDay)) : null;
  if (latest !== null && today - latest > STALE_AFTER_DAYS) {
    const past = sampleThroughput(dates, policy, latest + 1);
    const pastSummary = summarise(past);
    if (pastSummary.enoughHistory)
      return { team, policy, throughput: past, basis: 'past', windowEnd: fromDay(latest), summary: pastSummary, ...extra };
  }
  return { team, policy, throughput: null, basis: 'declared', summary: liveSummary, ...extra };
};
