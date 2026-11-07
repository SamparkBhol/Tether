import { kvs } from '@forge/kvs';
import { invalid } from '../domain/errors';
import type { Commitment, Team } from '../domain/types';
import { addWorkingDays, fromDay, toDay } from '../engine/forecast/calendar';
import { doc, paragraph, text } from '../jira/adf';
import { asApp, jira, route } from '../jira/client';
import { createIssue, pickIssueType } from '../jira/issues';
import { kvKey, log, todayIso } from '../lib/util';
import { getCommitment } from '../store/commitments';
import { raiseAsk } from './asks';
import { apply } from './lifecycle';
import { enqueue } from './queue';
import type { Scope } from './scope';
import { syncTeams } from './teams';
import { listProjects } from '../jira/projects';
import { draftAsk } from './asks';

interface Manifest {
  issues: string[];
  commitments: string[];
  createdAt: string;
}

const key = () => kvKey('sample', 'v1');
const LABEL = 'tether-sample';
const CAL = { workingWeekdays: [1, 2, 3, 4, 5], nonWorkingDates: [] as string[] };
const inDays = (n: number) => fromDay(addWorkingDays(CAL, toDay(todayIso()), n));

const dateAt = async (s: Scope, sourceIssueKey: string, ownerTeamId: string, size: number, chance: number, floor: number) => {
  const d = await draftAsk(s, { sourceIssueKey, ownerTeamId, neededBy: inDays(10), size });
  const hit = d.negotiation.curve.find((p) => p.probability >= chance)?.date ?? inDays(20);
  const min = inDays(floor);
  const max = inDays(floor + 12);
  return hit < min ? min : hit > max ? max : hit;
};

const ROLES: { role: string; pattern: RegExp; types: string[] }[] = [
  { role: 'legal', pattern: /legal/i, types: ['business', 'service_desk'] },
  { role: 'platform', pattern: /platform|backend|engineering|dev/i, types: ['software'] },
  { role: 'design', pattern: /design|creative|brand/i, types: ['business', 'software'] },
  { role: 'security', pattern: /secur/i, types: ['software', 'service_desk', 'business'] },
];

const pick = (teams: Team[], typeOf: Map<string, string>) => {
  const usable = teams.filter((t) => t.spaceKeys.length);
  const kind = (t: Team) => typeOf.get(t.spaceKeys[0]) ?? '';
  const requester = usable.find((t) => /market/i.test(t.name) && kind(t) !== 'service_desk') ?? usable[0];
  const used = new Set([requester?.id]);
  const owners: Record<string, Team> = {};
  for (const { role, pattern, types } of ROLES) {
    const free = usable.filter((t) => !used.has(t.id));
    const hit =
      free.find((t) => pattern.test(t.name) && types[0] === kind(t)) ??
      free.find((t) => pattern.test(t.name) && types.includes(kind(t))) ??
      free.find((t) => types[0] === kind(t)) ??
      free[0];
    if (hit) {
      owners[role] = hit;
      used.add(hit.id);
    }
  }
  return { requester, owners };
};

const workItem = async (s: Scope, team: Team, summary: string, detail: string) => {
  const projectKey = team.spaceKeys[0];
  const typeId = await pickIssueType(s.as, projectKey);
  if (!typeId) throw invalid(`Tether can't create work items in ${team.name}.`);
  const created = await createIssue(s.as, {
    projectKey,
    issueTypeId: typeId,
    summary,
    labels: [LABEL],
    description: doc(paragraph(text(detail)), paragraph(text('Part of the Tether sample launch. Remove it from Apps > Tether whenever you like.'))),
  });
  return created.key;
};

export const sampleStatus = async () => (await kvs.get<Manifest>(key())) ?? null;

export const createSample = async (s: Scope) => {
  if (await sampleStatus()) throw invalid('The sample launch is already there. Remove it first to make a fresh one.');
  const typeOf = new Map((await listProjects(s.as)).map((p) => [p.key, p.type]));
  const { requester, owners } = pick(await syncTeams(s), typeOf);
  if (!requester || Object.keys(owners).length < 2) throw invalid('Tether needs at least three Jira spaces to build a sample launch.');
  const m: Manifest = { issues: [], commitments: [], createdAt: new Date().toISOString() };
  const save = () => kvs.set(key(), m);
  const mark = (c: Commitment) => {
    m.commitments.push(c.id);
    return c;
  };
  const owner = { side: 'owner' as const, accountId: s.accountId };

  const pricing = await workItem(s, requester, 'Usage billing launch: pricing page', 'Public pricing page, plan comparison and FAQ for usage-based billing.');
  const upgrade = await workItem(s, requester, 'Usage billing launch: in-app upgrade flow', 'Customers on the old plans see an upgrade prompt with their projected bill.');
  const assets = await workItem(s, requester, 'Usage billing launch: announcement assets', 'Blog header, email banner and two social cards for launch day.');
  m.issues.push(pricing, upgrade, assets);
  await save();

  if (owners.legal) {
    const r = await raiseAsk(s, {
      sourceIssueKey: pricing,
      ownerTeamId: owners.legal.id,
      title: 'Review pricing terms and refund wording',
      detail: 'New usage tiers change what customers pay mid-month. We need the terms and the refund section signed off before the page goes live.',
      neededBy: fromDay(addWorkingDays(CAL, toDay(await dateAt(s, pricing, owners.legal.id, 2, 0.95, 4)), 3)),
      size: 2,
    });
    const c = mark(await apply(s, r.commitment.id, { kind: 'accept' }, owner, 'Sample launch'));
    if (c.ownerIssueKey) m.issues.push(c.ownerIssueKey);
  }

  if (owners.platform) {
    const r = await raiseAsk(s, {
      sourceIssueKey: upgrade,
      ownerTeamId: owners.platform.id,
      title: 'Metering API for usage tiers',
      detail: 'The upgrade flow needs current usage and a projected bill per workspace. Read only, p95 under 300 ms.',
      neededBy: await dateAt(s, upgrade, owners.platform.id, 3, 0.72, 4),
      size: 3,
    });
    const c = mark(await apply(s, r.commitment.id, { kind: 'accept' }, owner, 'Sample launch'));
    if (c.ownerIssueKey) {
      m.issues.push(c.ownerIssueKey);
      if (owners.security) {
        const sec = await raiseAsk(s, {
          sourceIssueKey: c.ownerIssueKey,
          ownerTeamId: owners.security.id,
          title: 'Security review of the metering endpoints',
          detail: 'New public read endpoints with workspace-level data. Needs a review before they ship.',
          neededBy: await dateAt(s, c.ownerIssueKey, owners.security.id, 1, 0.4, 2),
          size: 1,
        });
        const sc = mark(await apply(s, sec.commitment.id, { kind: 'accept' }, owner, 'Sample launch'));
        if (sc.ownerIssueKey) m.issues.push(sc.ownerIssueKey);
      }
    }
  }

  if (owners.design) {
    const r = await raiseAsk(s, {
      sourceIssueKey: assets,
      ownerTeamId: owners.design.id,
      title: 'Launch illustrations and email header',
      detail: 'Four assets in the new brand style. Copy is final.',
      neededBy: await dateAt(s, assets, owners.design.id, 4, 0.55, 3),
      size: 4,
    });
    mark(r.commitment);
  }

  await save();
  await enqueue({ kind: 'replan', reason: 'sample' }, 2);
  log('sample.created', { issues: m.issues.length, commitments: m.commitments.length });
  return { ...m, requester: requester.name, owners: Object.values(owners).map((t) => t.name) };
};

export const removeSample = async (s: Scope) => {
  const m = await sampleStatus();
  if (!m) return { removed: 0 };
  for (const id of m.commitments) {
    const c = await getCommitment(id);
    if (!c || ['withdrawn', 'declined', 'delivered'].includes(c.state)) continue;
    await apply({ ...s, system: true }, id, { kind: 'withdraw', reason: 'Sample launch removed' }, { side: 'requester', accountId: s.accountId }, undefined, {
      replan: false,
    }).catch((e) => log('sample.withdraw_failed', { id, message: (e as Error).message }));
  }
  let removed = 0;
  for (const k of m.issues) {
    try {
      await jira<void>(s.as, route`/rest/api/3/issue/${k}?deleteSubtasks=true`, `remove ${k}`, { method: 'DELETE' }).catch(() =>
        jira<void>(asApp, route`/rest/api/3/issue/${k}?deleteSubtasks=true`, `remove ${k}`, { method: 'DELETE' }),
      );
      removed++;
    } catch (e) {
      log('sample.delete_failed', { key: k, message: (e as Error).message });
    }
  }
  await kvs.delete(key());
  return { removed };
};
