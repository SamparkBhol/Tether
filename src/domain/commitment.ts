import { illegalTransition, invalid, notAllowed } from './errors';
import type { Actor, Commitment, CommitmentEvent, CommitmentState, EventType, Side, Terms } from './types';

export type Action =
  | { kind: 'accept' }
  | { kind: 'counter'; terms: Terms; reason?: string }
  | { kind: 'repropose'; terms: Terms; reason?: string }
  | { kind: 'decline'; reason: string }
  | { kind: 'withdraw'; reason?: string }
  | { kind: 'slip'; confidence: number }
  | { kind: 'recover'; confidence: number }
  | { kind: 'renegotiate'; terms: Terms; reason: string }
  | { kind: 'acceptRenegotiation' }
  | { kind: 'rejectRenegotiation'; reason?: string }
  | { kind: 'deliver'; at: string }
  | { kind: 'breach' };

interface Rule {
  from: CommitmentState[];
  by: Side[];
  verb: string;
  event: EventType;
}

const OPEN: CommitmentState[] = ['committed', 'at_risk', 'renegotiating'];

const RULES: Record<Action['kind'], Rule> = {
  accept: { from: ['proposed', 'countered'], by: ['owner', 'requester', 'system'], verb: 'accepted', event: 'accepted' },
  counter: { from: ['proposed'], by: ['owner'], verb: 'countered', event: 'countered' },
  repropose: { from: ['countered'], by: ['requester'], verb: 'proposed again', event: 'reproposed' },
  decline: { from: ['proposed', 'countered'], by: ['owner'], verb: 'declined', event: 'declined' },
  withdraw: { from: ['proposed', 'countered', ...OPEN], by: ['requester'], verb: 'withdrawn', event: 'withdrawn' },
  slip: { from: ['committed'], by: ['system'], verb: 'marked at risk', event: 'slipped' },
  recover: { from: ['at_risk'], by: ['system'], verb: 'marked back on track', event: 'recovered' },
  renegotiate: { from: ['committed', 'at_risk'], by: ['owner', 'system'], verb: 'renegotiated', event: 'renegotiation_opened' },
  acceptRenegotiation: { from: ['renegotiating'], by: ['requester'], verb: 'agreed on new terms', event: 'renegotiation_accepted' },
  rejectRenegotiation: { from: ['renegotiating'], by: ['requester'], verb: 'kept on the old terms', event: 'renegotiation_rejected' },
  deliver: { from: [...OPEN, 'broken'], by: ['owner', 'system'], verb: 'delivered', event: 'delivered' },
  breach: { from: OPEN, by: ['system'], verb: 'marked broken', event: 'broken' },
};

const acceptorFor = (state: CommitmentState): Side => (state === 'proposed' ? 'owner' : 'requester');

const nextState = (a: Action): CommitmentState => {
  switch (a.kind) {
    case 'accept':
    case 'recover':
    case 'acceptRenegotiation':
      return 'committed';
    case 'counter':
      return 'countered';
    case 'repropose':
      return 'proposed';
    case 'decline':
      return 'declined';
    case 'withdraw':
      return 'withdrawn';
    case 'slip':
    case 'rejectRenegotiation':
      return 'at_risk';
    case 'renegotiate':
      return 'renegotiating';
    case 'deliver':
      return 'delivered';
    case 'breach':
      return 'broken';
  }
};

const validateTerms = (t: Terms) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.dueDate)) throw invalid('Pick a due date.');
  if (!(t.size >= 1 && t.size <= 50)) throw invalid('Size has to be between 1 and 50 work items.');
};

const applyTerms = (c: Commitment, a: Action): Pick<Commitment, 'terms' | 'pendingTerms'> => {
  switch (a.kind) {
    case 'accept':
    case 'acceptRenegotiation':
      return { terms: c.pendingTerms ?? c.terms, pendingTerms: undefined };
    case 'counter':
    case 'renegotiate':
      validateTerms(a.terms);
      return { terms: c.terms, pendingTerms: a.terms };
    case 'repropose':
      validateTerms(a.terms);
      return { terms: a.terms, pendingTerms: undefined };
    case 'rejectRenegotiation':
      return { terms: c.terms, pendingTerms: undefined };
    default:
      return { terms: c.terms, pendingTerms: c.pendingTerms };
  }
};

export const can = (c: Commitment, kind: Action['kind'], side: Side): boolean => {
  const rule = RULES[kind];
  if (!rule.from.includes(c.state) || !rule.by.includes(side)) return false;
  return kind !== 'accept' || side === 'system' || acceptorFor(c.state) === side;
};

export const allowedActions = (c: Commitment, side: Side): Action['kind'][] =>
  (Object.keys(RULES) as Action['kind'][]).filter((k) => can(c, k, side));

export const transition = (
  c: Commitment,
  a: Action,
  actor: Actor,
  now: string,
  eventId: string,
): { next: Commitment; event: CommitmentEvent } => {
  const rule = RULES[a.kind];
  if (!rule.from.includes(c.state)) throw illegalTransition(c.state, rule.verb);
  if (!rule.by.includes(actor.side)) throw notAllowed(rule.by.join(' or '), `mark this ${rule.verb}`);
  if (a.kind === 'accept' && actor.side !== 'system' && acceptorFor(c.state) !== actor.side)
    throw notAllowed(acceptorFor(c.state), 'accept this');

  const to = nextState(a);
  const terms = applyTerms(c, a);
  const confidence = 'confidence' in a ? a.confidence : c.confidence;
  const next: Commitment = {
    ...c,
    ...terms,
    state: to,
    confidence,
    deliveredAt: a.kind === 'deliver' ? a.at : c.deliveredAt,
    version: c.version + 1,
    updatedAt: now,
  };
  const reason = 'reason' in a ? a.reason : undefined;
  const event: CommitmentEvent = {
    id: eventId,
    commitmentId: c.id,
    type: rule.event,
    actor,
    at: now,
    reason,
    from: c.state,
    to,
    data: 'terms' in a ? { terms: a.terms } : 'confidence' in a ? { confidence: a.confidence } : undefined,
  };
  return { next, event };
};

export const isOpen = (s: CommitmentState) => OPEN.includes(s);
export const isPending = (s: CommitmentState) => s === 'proposed' || s === 'countered';
export const isClosed = (s: CommitmentState) => !isOpen(s) && !isPending(s);
