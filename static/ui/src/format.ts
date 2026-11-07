import type { Option, State } from './types';

const DAY = 86_400_000;

export const toDate = (iso: string) => new Date(iso.slice(0, 10) + 'T00:00:00Z');

export const dayLabel = (iso: string) =>
  toDate(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

export const shortDay = (iso: string) => toDate(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });

export const daysBetween = (a: string, b: string) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / DAY);

export const addDays = (iso: string, n: number) => new Date(toDate(iso).getTime() + n * DAY).toISOString().slice(0, 10);

export const today = () => new Date().toISOString().slice(0, 10);

export const pct = (p: number | null | undefined) =>
  p === null || p === undefined ? 'n/a' : p >= 0.995 ? '99%+' : p > 0 && p < 0.005 ? 'under 1%' : `${Math.round(p * 100)}%`;

export type Tone = 'good' | 'tight' | 'low' | 'none';

export const tone = (p: number | null | undefined, target = 0.85, risk = 0.6): Tone =>
  p === null || p === undefined ? 'none' : p >= target ? 'good' : p >= risk ? 'tight' : 'low';

export const oddsWords = (p: number | null | undefined) => {
  if (p === null || p === undefined) return 'Not forecast yet';
  if (p >= 0.95) return 'Almost certain';
  if (p >= 0.85) return 'Very likely';
  if (p >= 0.7) return 'Likely';
  if (p >= 0.5) return 'About even';
  if (p >= 0.25) return 'Unlikely';
  return 'Very unlikely';
};

export const STATE_LABEL: Record<State, string> = {
  proposed: 'Waiting for answer',
  countered: 'Counter-offer',
  committed: 'Committed',
  at_risk: 'At risk',
  renegotiating: 'New terms proposed',
  delivered: 'Delivered',
  broken: 'Missed',
  declined: 'Declined',
  withdrawn: 'Withdrawn',
};

export const STATE_APPEARANCE: Record<State, 'default' | 'inprogress' | 'moved' | 'new' | 'removed' | 'success'> = {
  proposed: 'new',
  countered: 'moved',
  committed: 'inprogress',
  at_risk: 'moved',
  renegotiating: 'moved',
  delivered: 'success',
  broken: 'removed',
  declined: 'default',
  withdrawn: 'default',
};

export const optionTitle = (o: Option, neededBy: string) => {
  switch (o.kind) {
    case 'as_asked':
      return `As asked, ${dayLabel(o.dueDate)}`;
    case 'later_date': {
      const late = daysBetween(neededBy, o.dueDate);
      return `${dayLabel(o.dueDate)}, ${late} day${late === 1 ? '' : 's'} later`;
    }
    case 'jump_queue':
      return `On time by going first`;
    case 'split_scope':
      return `First ${o.size} item${o.size === 1 ? '' : 's'} on time`;
  }
};

export const optionDetail = (o: Option, teamName: (id: string) => string) => {
  if (o.kind === 'jump_queue') {
    const moved = o.impacts.filter((i) => i.slipDays > 0 || i.confidenceAfter < i.confidenceBefore);
    if (!moved.length) return 'Moves ahead of lower-priority work without hurting other promises.';
    return moved
      .map(
        (i) =>
          `${teamName(i.requesterTeamId)}'s "${i.title}" drops from ${pct(i.confidenceBefore)} to ${pct(i.confidenceAfter)}${
            i.slipDays ? `, about ${i.slipDays} days later` : ''
          }`,
      )
      .join('. ') + '.';
  }
  if (o.kind === 'split_scope' && o.remainder)
    return `The other ${o.remainder.size} follow by ${dayLabel(o.remainder.dueDate)}.`;
  if (o.kind === 'later_date') return 'Same scope, a date the team can hit.';
  return '';
};

export const issueUrl = (key: string) => `/browse/${key}`;
