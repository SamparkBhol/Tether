import { Queue } from '@forge/events';
import { log } from '../lib/util';

export type Job =
  | { kind: 'replan'; reason: string; teams?: string[] }
  | { kind: 'issue'; key: string; changelogId?: string; statusCategory?: string }
  | { kind: 'migrate' }
  | { kind: 'sync'; accountId?: string };

const queue = new Queue({ key: 'tether-work' });

export const enqueue = async (job: Job, delayInSeconds = 0) => {
  try {
    await queue.push({ body: job as unknown as Record<string, unknown>, delayInSeconds, concurrency: { key: 'tether-replan', limit: 1 } });
  } catch (e) {
    log('queue.push_failed', { kind: job.kind, message: (e as Error).message });
  }
};
