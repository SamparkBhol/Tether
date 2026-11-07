export interface QueueItem {
  id: string;
  title: string;
  size: number;
  dueDate: string;
  goalWeight: number;
  createdAt: string;
  requesterTeamId: string;
}

export const byDeadline = (a: QueueItem, b: QueueItem) =>
  a.dueDate.localeCompare(b.dueDate) || b.goalWeight - a.goalWeight || a.createdAt.localeCompare(b.createdAt);

export const ordered = (items: QueueItem[]) => [...items].sort(byDeadline);

export const insertAt = (queue: QueueItem[], item: QueueItem): number => {
  const sorted = ordered(queue.filter((q) => q.id !== item.id));
  const idx = sorted.findIndex((q) => byDeadline(item, q) < 0);
  return idx === -1 ? sorted.length : idx;
};

export const sizeAhead = (queue: QueueItem[], item: QueueItem, position?: number): number => {
  const sorted = ordered(queue.filter((q) => q.id !== item.id));
  const at = position ?? insertAt(queue, item);
  return sorted.slice(0, at).reduce((s, q) => s + q.size, 0);
};

export const placedBefore = (queue: QueueItem[], item: QueueItem, targetId: string) => {
  const sorted = ordered(queue.filter((q) => q.id !== item.id));
  const idx = sorted.findIndex((q) => q.id === targetId);
  return idx === -1 ? insertAt(queue, item) : idx;
};
