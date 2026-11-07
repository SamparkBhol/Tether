import { normalisePolicy } from '../domain/policy';
import type { Actor, Ask, Channel, CommitmentEvent, Team, TeamPolicy } from '../domain/types';
import { nowIso, parseJson } from '../lib/util';
import { exec, one, placeholders, rows } from './db';

interface AskRow {
  id: string;
  requester_team_id: string;
  owner_team_id: string;
  source_issue_key: string;
  title: string;
  detail: string | null;
  needed_by: string;
  goal_ids: string;
  created_by: string;
  channel: Channel;
  agent_client: string | null;
  created_at: string;
}

const askFrom = (r: AskRow): Ask => ({
  id: r.id,
  requesterTeamId: r.requester_team_id,
  ownerTeamId: r.owner_team_id,
  sourceIssueKey: r.source_issue_key,
  title: r.title,
  detail: r.detail ?? '',
  neededBy: r.needed_by,
  goalIds: parseJson<string[]>(r.goal_ids, []),
  createdBy: r.created_by,
  channel: r.channel,
  agentClient: r.agent_client ?? undefined,
  createdAt: r.created_at,
});

export const insertAsk = (a: Ask) =>
  exec(
    `INSERT INTO asks (id, requester_team_id, owner_team_id, source_issue_key, title, detail, needed_by, goal_ids, created_by, channel, agent_client, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    a.id,
    a.requesterTeamId,
    a.ownerTeamId,
    a.sourceIssueKey,
    a.title,
    a.detail,
    a.neededBy,
    JSON.stringify(a.goalIds),
    a.createdBy,
    a.channel,
    a.agentClient ?? null,
    a.createdAt,
  );

export const getAsk = async (id: string) => {
  const r = await one<AskRow>('SELECT * FROM asks WHERE id = ?', id);
  return r ? askFrom(r) : undefined;
};

export const getAsks = async (ids: string[]) =>
  ids.length ? (await rows<AskRow>(`SELECT * FROM asks WHERE id IN (${placeholders(ids.length)})`, ...ids)).map(askFrom) : [];

interface EventRow {
  id: string;
  commitment_id: string;
  type: CommitmentEvent['type'];
  actor: string;
  at: string;
  reason: string | null;
  from_state: CommitmentEvent['from'];
  to_state: CommitmentEvent['to'];
  data: string | null;
}

export const appendEvent = (e: CommitmentEvent) =>
  exec(
    `INSERT INTO commitment_events (id, commitment_id, type, actor, at, reason, from_state, to_state, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    e.id,
    e.commitmentId,
    e.type,
    JSON.stringify(e.actor),
    e.at,
    e.reason ?? null,
    e.from,
    e.to,
    e.data ? JSON.stringify(e.data) : null,
  );

export const eventsFor = async (commitmentId: string): Promise<CommitmentEvent[]> =>
  (await rows<EventRow>('SELECT * FROM commitment_events WHERE commitment_id = ? ORDER BY at ASC LIMIT 200', commitmentId)).map((r) => ({
    id: r.id,
    commitmentId: r.commitment_id,
    type: r.type,
    actor: parseJson<Actor>(r.actor, { side: 'system' }),
    at: r.at,
    reason: r.reason ?? undefined,
    from: r.from_state,
    to: r.to_state,
    data: parseJson<Record<string, unknown> | undefined>(r.data, undefined),
  }));

interface TeamRow {
  id: string;
  name: string;
  source: Team['source'];
  space_keys: string;
  avatar_url: string | null;
  profile_url: string | null;
}

const teamFrom = (r: TeamRow): Team => ({
  id: r.id,
  name: r.name,
  source: r.source,
  spaceKeys: parseJson<string[]>(r.space_keys, []),
  avatarUrl: r.avatar_url ?? undefined,
  profileUrl: r.profile_url ?? undefined,
});

export const upsertTeam = (t: Team) =>
  exec(
    `INSERT INTO teams (id, name, source, space_keys, avatar_url, profile_url, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name), source = VALUES(source), space_keys = VALUES(space_keys), avatar_url = VALUES(avatar_url), profile_url = VALUES(profile_url), updated_at = VALUES(updated_at)`,
    t.id,
    t.name,
    t.source,
    JSON.stringify(t.spaceKeys),
    t.avatarUrl ?? null,
    t.profileUrl ?? null,
    nowIso(),
  );

export const getTeam = async (id: string) => {
  const r = await one<TeamRow>('SELECT * FROM teams WHERE id = ?', id);
  return r ? teamFrom(r) : undefined;
};

export const allTeams = async () => (await rows<TeamRow>('SELECT * FROM teams ORDER BY name LIMIT 500')).map(teamFrom);

export const getPolicy = async (teamId: string): Promise<TeamPolicy> => {
  const r = await one<{ body: string; version: number }>('SELECT body, version FROM policies WHERE team_id = ?', teamId);
  return normalisePolicy({ ...parseJson<Partial<TeamPolicy>>(r?.body, {}), teamId, version: r?.version ?? 0 });
};

export const savePolicy = async (p: TeamPolicy, by: string) => {
  const next = normalisePolicy(p);
  const n = await exec(
    'UPDATE policies SET body = ?, version = version + 1, updated_by = ?, updated_at = ? WHERE team_id = ? AND version = ?',
    JSON.stringify(next),
    by,
    nowIso(),
    p.teamId,
    p.version,
  );
  if (n === 0 && p.version === 0)
    await exec(
      'INSERT INTO policies (team_id, body, version, updated_by, updated_at) VALUES (?, ?, 1, ?, ?)',
      p.teamId,
      JSON.stringify(next),
      by,
      nowIso(),
    );
  else if (n === 0) return null;
  return getPolicy(p.teamId);
};

export const saveSnapshot = (s: { commitmentId: string; takenOn: string; probability: number; p50: string; p85: string; basis: string; inputs?: unknown }) =>
  exec(
    `INSERT INTO forecast_snapshots (commitment_id, taken_on, probability, p50, p85, basis, inputs) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE probability = VALUES(probability), p50 = VALUES(p50), p85 = VALUES(p85), basis = VALUES(basis), inputs = VALUES(inputs)`,
    s.commitmentId,
    s.takenOn,
    s.probability,
    s.p50,
    s.p85,
    s.basis,
    s.inputs ? JSON.stringify(s.inputs) : null,
  );

export const latestInputs = async <T>(commitmentId: string): Promise<T | null> => {
  const r = await one<{ inputs: string | null }>(
    'SELECT inputs FROM forecast_snapshots WHERE commitment_id = ? AND inputs IS NOT NULL ORDER BY taken_on DESC LIMIT 1',
    commitmentId,
  );
  return r?.inputs ? parseJson<T | null>(r.inputs, null) : null;
};

export const snapshotsFor = (commitmentId: string) =>
  rows<{ taken_on: string; probability: number; p50: string; p85: string; basis: string }>(
    'SELECT taken_on, probability, p50, p85, basis FROM forecast_snapshots WHERE commitment_id = ? ORDER BY taken_on ASC LIMIT 120',
    commitmentId,
  );

export const recordOutcome = (o: { commitmentId: string; ownerTeamId: string; predicted: number; hit: boolean; slipDays: number }) =>
  exec(
    `INSERT INTO outcomes (commitment_id, owner_team_id, predicted, hit, slip_days, closed_at) VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE predicted = VALUES(predicted), hit = VALUES(hit), slip_days = VALUES(slip_days), closed_at = VALUES(closed_at)`,
    o.commitmentId,
    o.ownerTeamId,
    o.predicted,
    o.hit ? 1 : 0,
    o.slipDays,
    nowIso(),
  );

export const outcomesFor = async (teamId: string) =>
  (
    await rows<{ predicted: number; hit: number; slip_days: number }>(
      'SELECT predicted, hit, slip_days FROM outcomes WHERE owner_team_id = ? ORDER BY closed_at DESC LIMIT 200',
      teamId,
    )
  ).map((r) => ({ predicted: Number(r.predicted), hit: Number(r.hit) === 1, slipDays: Number(r.slip_days) }));
