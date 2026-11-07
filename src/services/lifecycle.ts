import { transition, type Action } from '../domain/commitment';
import { notAllowed, notFound } from '../domain/errors';
import type { Actor, Commitment, Side, Team } from '../domain/types';
import { toDay } from '../engine/forecast/calendar';
import { bullets, doc, link, paragraph, strong, text } from '../jira/adf';
import { asApp } from '../jira/client';
import { createIssue, getIssue, linkBlocks, pickIssueType, setDueDate } from '../jira/issues';
import { log, newId, nowIso } from '../lib/util';
import { getCommitment, saveCommitment, setOwnerIssue } from '../store/commitments';
import { appendEvent, getAsk, getTeam, recordOutcome } from '../store/records';
import { forecastCommitment } from './forecasting';
import { loadModel } from './model';
import { broadcast, day, tellCommitted, tellCountered, tellDeclined, tellDelivered, tellRenegotiation } from './notify';
import { enqueue } from './queue';
import type { Scope } from './scope';
import { requireTeam } from './teams';
import { access } from './access';

export const sideFor = async (s: Scope, c: Commitment, preferred?: Side): Promise<Side> => {
  if (s.system) return 'system';
  const acc = access(s);
  const [owner, requester] = await Promise.all([acc.canActFor(await getTeam(c.ownerTeamId)), acc.canActFor(await getTeam(c.requesterTeamId))]);
  if (preferred === 'owner' && owner) return 'owner';
  if (preferred === 'requester' && requester) return 'requester';
  if (owner) return 'owner';
  if (requester) return 'requester';
  throw notAllowed('owning or asking', "change this commitment. You need permission to create and edit work in that team's space");
};

const ownerWork = async (s: Scope, c: Commitment, owner: Team, requester: Team) => {
  const projectKey = owner.spaceKeys[0];
  if (!projectKey) return null;
  const as = s.system ? asApp : s.as;
  const typeId = await pickIssueType(as, projectKey);
  if (!typeId) return null;
  const ask = await getAsk(c.askId);
  const source = await getIssue(asApp, c.sourceIssueKey);
  const created = await createIssue(as, {
    projectKey,
    issueTypeId: typeId,
    summary: c.title,
    labels: ['tether'],
    dueDate: c.terms.dueDate,
    description: doc(
      paragraph(strong(requester.name), text(' asked for this through Tether.')),
      bullets([
        [text('Needed by '), strong(day(c.neededBy))],
        [text('Agreed for '), strong(day(c.terms.dueDate)), text(c.terms.size > 1 ? `, ${c.terms.size} items` : '')],
        ...(source ? [[text('For '), link(`${source.key} ${source.summary}`, source.url)]] : []),
      ]),
      ...(ask?.detail ? [paragraph(text(ask.detail))] : []),
      ...(c.terms.scope ? [paragraph(strong('Scope: '), text(c.terms.scope))] : []),
    ),
  });
  try {
    await linkBlocks(as, created.key, c.sourceIssueKey);
  } catch (e) {
    log('link.failed', { key: created.key, message: (e as Error).message });
  }
  return created.key;
};

const confidenceNow = async (c: Commitment, owner: Team) => {
  try {
    const model = await loadModel(owner);
    return (await forecastCommitment(c, model)).probabilityByDue;
  } catch (e) {
    log('forecast.failed', { id: c.id, message: (e as Error).message });
    return c.confidence;
  }
};

export const apply = async (
  s: Scope,
  id: string,
  action: Action,
  actor: Actor,
  note?: string,
  opts: { replan?: boolean } = {},
): Promise<Commitment> => {
  const before = await getCommitment(id);
  if (!before) throw notFound('That commitment');
  const { next, event } = transition(before, action, actor, nowIso(), newId());
  const owner = await requireTeam(next.ownerTeamId);
  const requester = await requireTeam(next.requesterTeamId);

  if (action.kind === 'accept' || action.kind === 'acceptRenegotiation') {
    const p = await confidenceNow(next, owner);
    next.confidence = p;
    next.committedConfidence = p;
  }

  if (next.pendingTerms && (action.kind === 'counter' || action.kind === 'repropose' || action.kind === 'renegotiate'))
    next.pendingTerms = { ...next.pendingTerms, confidence: await confidenceNow({ ...next, terms: next.pendingTerms }, owner) };

  await saveCommitment(next, before.version);
  await appendEvent({ ...event, reason: event.reason ?? note });

  const ask = await getAsk(next.askId);
  const requesterId = ask?.createdBy ?? '';
  const as = s.system ? asApp : s.as;

  if (action.kind === 'accept' && next.ownerIssueKey) {
    const existing = await getIssue(asApp, next.ownerIssueKey);
    if (existing && !existing.dueDate) await setDueDate(asApp, existing.key, next.terms.dueDate).catch(() => undefined);
  }
  if (action.kind === 'accept' && !next.ownerIssueKey) {
    const key = await ownerWork(s, next, owner, requester).catch((e) => {
      log('owner_work.failed', { id, message: (e as Error).message });
      return null;
    });
    if (key) {
      next.ownerIssueKey = key;
      await setOwnerIssue(next.id, key);
    }
  }
  if (action.kind === 'acceptRenegotiation' && next.ownerIssueKey)
    await setDueDate(asApp, next.ownerIssueKey, next.terms.dueDate).catch(() => undefined);

  const ownerIssue = next.ownerIssueKey ? await getIssue(asApp, next.ownerIssueKey) : null;
  switch (action.kind) {
    case 'accept':
    case 'acceptRenegotiation':
      await tellCommitted(as, next, owner, requesterId, ownerIssue?.url);
      break;
    case 'counter':
      await tellCountered(as, next, owner, requesterId, action.reason);
      break;
    case 'decline':
      await tellDeclined(as, next, owner, requesterId, action.reason);
      break;
    case 'renegotiate':
      await tellRenegotiation(as, next, owner, requesterId, [action.reason]);
      break;
    case 'deliver': {
      const onTime = toDay(action.at) <= toDay(next.terms.dueDate);
      await recordOutcome({
        commitmentId: next.id,
        ownerTeamId: next.ownerTeamId,
        predicted: next.committedConfidence ?? next.confidence ?? 0.5,
        hit: onTime,
        slipDays: Math.max(0, toDay(action.at) - toDay(next.terms.dueDate)),
      });
      await tellDelivered(as, next, owner, onTime);
      break;
    }
    case 'breach':
      await recordOutcome({
        commitmentId: next.id,
        ownerTeamId: next.ownerTeamId,
        predicted: next.committedConfidence ?? next.confidence ?? 0.5,
        hit: false,
        slipDays: 0,
      });
      break;
  }

  await broadcast(next, event.type);
  if (opts.replan !== false) await enqueue({ kind: 'replan', reason: event.type, teams: [next.ownerTeamId, next.requesterTeamId] }, 5);
  return next;
};

export const actAsUser = async (s: Scope, id: string, action: Action, preferred?: Side, note?: string) => {
  const c = await getCommitment(id);
  if (!c) throw notFound('That commitment');
  const side = await sideFor(s, c, preferred);
  return apply(s, id, action, { side, accountId: s.accountId }, note);
};
