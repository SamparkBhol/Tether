import type { Commitment, Team } from '../domain/types';
import { toDay } from '../engine/forecast/calendar';
import type { SimulationResult } from '../engine/forecast/montecarlo';
import type { Negotiation, Option } from '../engine/negotiate/options';
import { day } from './notify';

export interface Inputs {
  perWeek: number;
  askShare: number;
  itemsAhead: number;
  size: number;
  basis: string;
}

export const inputsOf = (r: SimulationResult): Inputs => ({
  perWeek: Math.round(r.inputs.perDay * 5 * 100) / 100,
  askShare: r.inputs.askShare,
  itemsAhead: r.inputs.itemsAhead,
  size: r.inputs.size,
  basis: r.inputs.basis,
});

const pct = (p: number) => `${Math.round(p * 100)}%`;
const rate = (n: number) => (n >= 1 ? `${Math.round(n * 10) / 10}` : `${Math.round(n * 100) / 100}`);

export interface UpstreamDrag {
  title: string;
  confidence: number;
}

export const causes = (
  c: Commitment,
  owner: Team,
  now: Inputs,
  before: Inputs | null,
  upstream: UpstreamDrag[],
  ownerIssue: { key: string; statusCategory: string } | null,
  today: number,
): string[] => {
  const out: string[] = upstream.map((u) => `Waiting on "${u.title}", which is now ${pct(u.confidence)} likely on time.`);
  if (before) {
    const capBefore = before.perWeek * before.askShare;
    const capNow = now.perWeek * now.askShare;
    if (capNow < capBefore * 0.8) {
      out.push(
        now.basis === 'declared' && before.basis === 'declared'
          ? `${owner.name} lowered the time it gives to other teams' asks, from about ${rate(capBefore)} to ${rate(capNow)} items a week.`
          : `${owner.name} has been finishing less lately, about ${rate(capNow)} ask items a week instead of ${rate(capBefore)}.`,
      );
    }
    if (now.itemsAhead > before.itemsAhead) {
      const n = now.itemsAhead - before.itemsAhead;
      out.push(`${n} more item${n === 1 ? ' is' : 's are'} now ahead of this in ${owner.name}'s queue.`);
    }
  }
  const left = toDay(c.terms.dueDate) - today;
  if (ownerIssue && ownerIssue.statusCategory === 'new' && left <= 14)
    out.push(`${ownerIssue.key} hasn't started and only ${left} day${left === 1 ? '' : 's'} are left.`);
  if (!out.length) out.push(`${owner.name}'s pace and queue put this at ${pct(c.confidence ?? 0)} for ${day(c.terms.dueDate)}.`);
  return out;
};

export type Decision =
  | { kind: 'propose'; option: Option }
  | { kind: 'escalate'; keepDate: Option | null; realistic: Option | null; maxSlipDays: number }
  | { kind: 'nothing' };

export const maxSlipFor = (c: Commitment) => {
  const lead = Math.max(1, toDay(c.terms.dueDate) - toDay(c.createdAt));
  return Math.max(7, Math.round(lead * 0.5));
};

export const decide = (c: Commitment, n: Negotiation): Decision => {
  const maxSlip = maxSlipFor(c);
  const keepDate =
    n.options
      .filter((o) => o.meetsNeededBy && o.kind !== 'as_asked' && o.kind !== 'split_scope' && o.confidence >= 0.5)
      .sort((a, b) => b.score - a.score)[0] ?? null;
  const split = n.options.find((o) => o.kind === 'split_scope') ?? null;
  const later = n.options.find((o) => o.kind === 'later_date') ?? null;
  const slip = later ? toDay(later.dueDate) - toDay(c.terms.dueDate) : Infinity;

  if (split && (!later || slip > maxSlip)) return { kind: 'propose', option: split };
  if (later && slip <= maxSlip && !keepDate) return { kind: 'propose', option: later };
  if (keepDate || later) return { kind: 'escalate', keepDate, realistic: later, maxSlipDays: maxSlip };
  return { kind: 'nothing' };
};
