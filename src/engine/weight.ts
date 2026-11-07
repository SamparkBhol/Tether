import type { Goal } from '../domain/types';
import { toDay } from './forecast/calendar';

const STATE_URGENCY: Record<string, number> = {
  off_track: 1.6,
  at_risk: 1.35,
  on_track: 1,
  pending: 0.9,
  paused: 0.5,
  done: 0.3,
  archived: 0.2,
};

const norm = (s?: string) => (s ?? '').toLowerCase().replace(/[\s-]+/g, '_');

export const goalWeight = (goals: Goal[], today: number, ranks: Record<string, number> = {}): number => {
  if (!goals.length) return 1;
  const parts = goals.map((g) => {
    const urgency = STATE_URGENCY[norm(g.state)] ?? 1;
    const days = g.dueDate ? toDay(g.dueDate) - today : 120;
    const proximity = days <= 0 ? 1.5 : days < 30 ? 1.3 : days < 90 ? 1.1 : 1;
    const rank = ranks[g.id];
    const ranked = rank ? 1 + Math.max(0, 5 - rank) * 0.1 : 1;
    return urgency * proximity * ranked;
  });
  return Math.round((1 + Math.max(...parts) + (parts.length - 1) * 0.1) * 100) / 100;
};
