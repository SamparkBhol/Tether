import { kvs } from '@forge/kvs';
import type { Team } from '../domain/types';
import { spacesForTeam, teamsForSpace, teamsOfUser } from '../graph/context';
import { listProjects, type ProjectLite } from '../jira/projects';
import { allTeams, getTeam, upsertTeam } from '../store/records';
import { graphScope, type Scope } from './scope';

const SYNC_KEY = 'teams:synced';
const SKIP_TYPES = new Set(['product_discovery']);

export const spaceTeamId = (projectKey: string) => `space:${projectKey}`;

const spaceTeam = (p: ProjectLite): Team => ({
  id: spaceTeamId(p.key),
  name: p.name,
  source: 'space',
  spaceKeys: [p.key],
  avatarUrl: p.avatarUrl,
});

const limit = async <T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> => {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    new Array(Math.min(n, items.length)).fill(0).map(async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
};

export const syncTeams = async (s: Scope, force = false): Promise<Team[]> => {
  if (!force && (await kvs.get<boolean>(SYNC_KEY))) return allTeams();
  const projects = (await listProjects(s.as)).filter((p) => !SKIP_TYPES.has(p.type));
  const gs = graphScope(s);
  const graphTeams = new Map<string, Team>();
  const covered = new Set<string>();
  const perSpace = await limit(projects, 5, async (p) => ({ p, teams: await teamsForSpace(gs, p.id) }));
  for (const { p, teams } of perSpace) {
    for (const t of teams) {
      const existing = graphTeams.get(t.id);
      graphTeams.set(t.id, {
        id: t.id,
        name: t.name,
        source: 'graph',
        spaceKeys: [...new Set([...(existing?.spaceKeys ?? []), p.key])],
        avatarUrl: t.avatarUrl,
        profileUrl: t.profileUrl,
      });
      covered.add(p.key);
    }
  }
  const teams = [...graphTeams.values(), ...projects.filter((p) => !covered.has(p.key)).map(spaceTeam)];
  await limit(teams, 5, upsertTeam);
  await kvs.set(SYNC_KEY, true, { ttl: { value: 6, unit: 'HOURS' } });
  return allTeams();
};

export const teamForProject = async (s: Scope, projectKey: string): Promise<Team> => {
  const teams = await syncTeams(s);
  const hit = teams.find((t) => t.source === 'graph' && t.spaceKeys.includes(projectKey)) ?? teams.find((t) => t.spaceKeys.includes(projectKey));
  if (hit) return hit;
  const projects = await listProjects(s.as);
  const p = projects.find((x) => x.key === projectKey);
  const t: Team = p ? spaceTeam(p) : { id: spaceTeamId(projectKey), name: projectKey, source: 'space', spaceKeys: [projectKey] };
  await upsertTeam(t);
  return t;
};

export const requireTeam = async (id: string) => {
  const t = await getTeam(id);
  if (!t) throw new Error('That team is not known to Tether yet. Open Tether once so it can sync teams.');
  return t;
};

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

export const findTeams = (teams: Team[], query: string): Team[] => {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const qw = words(q);
  const scored = teams.map((t) => {
    const name = t.name.toLowerCase();
    const keys = t.spaceKeys.map((k) => k.toLowerCase());
    let score = 0;
    if (keys.includes(q) || name === q) score = 100;
    else if (name.startsWith(q)) score = 80;
    else if (name.includes(q)) score = 60;
    else {
      const nw = words(name);
      const overlap = qw.filter((w) => nw.some((n) => n.startsWith(w) || w.startsWith(n))).length;
      score = overlap ? 30 + overlap * 10 : 0;
    }
    if (t.source === 'graph') score += 2;
    return { t, score };
  });
  return scored
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.t);
};

const MY_TEAMS = (accountId: string) => `my-teams:${accountId}`;

export const myTeamIds = async (s: Scope): Promise<string[]> => {
  if (!s.accountId) return [];
  const pinned = (await kvs.get<string[]>(MY_TEAMS(s.accountId))) ?? [];
  const fromGraph = (await teamsOfUser(graphScope(s), s.accountId)).map((t) => t.id);
  return [...new Set([...fromGraph, ...pinned])];
};

export const pinTeam = async (s: Scope, teamId: string, on: boolean) => {
  if (!s.accountId) return [];
  const key = MY_TEAMS(s.accountId);
  const cur = (await kvs.get<string[]>(key)) ?? [];
  const next = on ? [...new Set([...cur, teamId])] : cur.filter((x) => x !== teamId);
  await kvs.set(key, next);
  return next;
};

export const spacesOf = async (s: Scope, team: Team) => {
  if (team.source !== 'graph') return team.spaceKeys;
  const spaces = await spacesForTeam(graphScope(s), team.id);
  return spaces.length ? spaces.map((x) => x.key) : team.spaceKeys;
};
