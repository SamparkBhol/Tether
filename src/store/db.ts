import { kvs } from '@forge/kvs';
import sql from '@forge/sql';
import { log, sleep } from '../lib/util';
import { migrations } from './schema';

const SCHEMA_KEY = 'schema:ready:v013';
let ready = false;

export const migrate = async () => {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const applied = await migrations.run();
      await kvs.set(SCHEMA_KEY, true);
      ready = true;
      log('schema.migrated', { applied });
      return applied;
    } catch (e) {
      log('schema.retry', { attempt, message: (e as Error).message });
      await sleep(1500 * (attempt + 1));
    }
  }
  throw new Error('Could not prepare storage. Try again in a minute.');
};

export const ensureSchema = async () => {
  if (ready) return;
  if (await kvs.get<boolean>(SCHEMA_KEY)) {
    ready = true;
    return;
  }
  await migrate();
};

export const rows = async <T>(query: string, ...params: unknown[]): Promise<T[]> => {
  await ensureSchema();
  const r = await sql.prepare<T>(query).bindParams(...params).execute();
  return r.rows as T[];
};

export const one = async <T>(query: string, ...params: unknown[]): Promise<T | undefined> => (await rows<T>(query, ...params))[0];

export const exec = async (query: string, ...params: unknown[]): Promise<number> => {
  await ensureSchema();
  const r = await sql.prepare<{ affectedRows: number }>(query).bindParams(...params).execute();
  return (r.rows as unknown as { affectedRows: number }).affectedRows ?? 0;
};

export const placeholders = (n: number) => new Array(n).fill('?').join(',');

export const lim = (n: number) => Math.max(1, Math.min(5000, Math.floor(Number(n) || 1)));
