import { publishGlobal } from '@forge/realtime';
import type { Commitment, Team } from '../domain/types';
import { bullets, doc, link, mention, paragraph, panel, strong, text } from '../jira/adf';
import { comment } from '../jira/issues';
import type { As } from '../jira/client';
import { log } from '../lib/util';
import type { Option } from '../engine/negotiate/options';
import type { Decision } from './diagnose';

export const CHANNEL = 'tether:changes';

export const broadcast = async (c: Commitment, kind: string) => {
  try {
    await publishGlobal(CHANNEL, {
      kind,
      id: c.id,
      state: c.state,
      teams: [c.ownerTeamId, c.requesterTeamId],
      issues: [c.sourceIssueKey, c.ownerIssueKey].filter(Boolean),
    });
  } catch (e) {
    log('realtime.failed', { message: (e as Error).message });
  }
};

const pct = (p?: number) => (p === undefined ? 'unknown' : p >= 0.995 ? '99%+' : `${Math.round(p * 100)}%`);

export const day = (iso: string) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

const safeComment = async (as: As, key: string | undefined, body: unknown) => {
  if (!key) return;
  try {
    await comment(as, key, body);
  } catch (e) {
    log('comment.failed', { key, message: (e as Error).message });
  }
};

export const tellCommitted = (as: As, c: Commitment, owner: Team, requesterId: string, ownerIssueUrl?: string) =>
  safeComment(
    as,
    c.sourceIssueKey,
    doc(
      panel(
        'success',
        paragraph(
          mention(requesterId),
          text(' '),
          strong(owner.name),
          text(` committed to "${c.title}" by ${day(c.terms.dueDate)}. Tether puts that at ${pct(c.confidence)} right now.`),
        ),
        ...(c.ownerIssueKey && ownerIssueUrl ? [paragraph(text('Tracked in '), link(c.ownerIssueKey, ownerIssueUrl), text('.'))] : []),
      ),
    ),
  );

export const tellCountered = (as: As, c: Commitment, owner: Team, requesterId: string, why?: string) =>
  safeComment(
    as,
    c.sourceIssueKey,
    doc(
      panel(
        'note',
        paragraph(
          mention(requesterId),
          text(' '),
          strong(owner.name),
          text(` can do "${c.title}" by ${day(c.pendingTerms?.dueDate ?? c.terms.dueDate)}`),
          text(c.pendingTerms && c.pendingTerms.size < c.terms.size ? ` (first ${c.pendingTerms.size} of ${c.terms.size} items)` : ''),
          text('.'),
        ),
        ...(why ? [paragraph(text(why))] : []),
        paragraph(text('Accept or propose something else from the Tether panel on this work item.')),
      ),
    ),
  );

export const tellDeclined = (as: As, c: Commitment, owner: Team, requesterId: string, reason: string) =>
  safeComment(
    as,
    c.sourceIssueKey,
    doc(panel('warning', paragraph(mention(requesterId), text(' '), strong(owner.name), text(` passed on "${c.title}": ${reason}`)))),
  );

export const tellRenegotiation = (
  as: As,
  c: Commitment,
  owner: Team,
  requesterId: string,
  reasons: string[],
) =>
  safeComment(
    as,
    c.sourceIssueKey,
    doc(
      panel(
        'warning',
        paragraph(
          mention(requesterId),
          text(` "${c.title}" from `),
          strong(owner.name),
          text(` is now ${pct(c.confidence)} likely by ${day(c.terms.dueDate)}.`),
        ),
        ...(reasons.length ? [bullets(reasons.map((r) => [text(r)]))] : []),
        paragraph(
          text('Tether proposes '),
          strong(day(c.pendingTerms?.dueDate ?? c.terms.dueDate)),
          text(c.pendingTerms?.confidence !== undefined ? ` (${pct(c.pendingTerms.confidence)} likely)` : ''),
          text(c.pendingTerms && c.pendingTerms.size < c.terms.size ? ` for the first ${c.pendingTerms.size} items` : ''),
          text('. Accept it or keep the old date from the Tether panel.'),
        ),
      ),
    ),
  );

export const tellDelivered = (as: As, c: Commitment, owner: Team, onTime: boolean) =>
  safeComment(
    as,
    c.sourceIssueKey,
    doc(
      panel(
        'success',
        paragraph(strong(owner.name), text(` delivered "${c.title}"${onTime ? ' on time' : ', a little late'}.`)),
      ),
    ),
  );

const keepLine = (o: Option, owner: Team) => {
  if (o.kind === 'make_room' && o.askShare)
    return `Keep ${day(o.dueDate)}: ${owner.name} gives about ${Math.round(o.askShare.to * 100)}% of its time to asks for the next ${o.askShare.weeks} week${o.askShare.weeks === 1 ? '' : 's'}, instead of ${Math.round(o.askShare.from * 100)}% (${pct(o.confidence)} likely).`;
  if (o.kind === 'jump_queue') {
    const moved = o.impacts.filter((i) => i.slipDays > 0).map((i) => `"${i.title}" by ${i.slipDays} days`);
    return `Keep ${day(o.dueDate)}: ${owner.name} does this before lower-priority work${moved.length ? `, pushing ${moved.join(' and ')}` : ''} (${pct(o.confidence)} likely).`;
  }
  return `Keep ${day(o.dueDate)} (${pct(o.confidence)} likely).`;
};

export const tellEscalation = async (
  as: As,
  c: Commitment,
  owner: Team,
  requesterName: string,
  reasons: string[],
  d: Extract<Decision, { kind: 'escalate' }>,
) => {
  const choices: unknown[][] = [];
  if (d.keepDate) choices.push([text(keepLine(d.keepDate, owner))]);
  if (d.realistic) {
    const late = Math.round((Date.parse(d.realistic.dueDate) - Date.parse(c.terms.dueDate)) / 86_400_000);
    choices.push([
      text(`Or move the date to ${day(d.realistic.dueDate)} (${pct(d.realistic.confidence)} likely). That is ${late} days later, more than Tether will propose on its own.`),
    ]);
  }
  const body = (lead: unknown[]) =>
    doc(
      panel(
        'warning',
        paragraph(...(lead as never[])),
        ...(reasons.length ? [bullets(reasons.map((r) => [text(r)]))] : []),
        ...(choices.length ? [paragraph(strong('Ways forward')), bullets(choices as never)] : []),
        paragraph(text(`${owner.name} picks one in its Tether desk. Nothing changes until it does.`)),
      ),
    );
  await safeComment(as, c.sourceIssueKey, body([text(`"${c.title}" from `), strong(owner.name), text(` is now ${pct(c.confidence)} likely by ${day(c.terms.dueDate)}.`)]));
  await safeComment(as, c.ownerIssueKey, body([text(`${requesterName} needs this by ${day(c.terms.dueDate)}, and it is now ${pct(c.confidence)} likely.`)]));
};
