export type State =
  | 'proposed'
  | 'countered'
  | 'committed'
  | 'at_risk'
  | 'renegotiating'
  | 'delivered'
  | 'broken'
  | 'declined'
  | 'withdrawn';

export type Side = 'owner' | 'requester';

export interface TeamLite {
  id: string;
  name: string;
  avatarUrl?: string;
  source: 'graph' | 'space';
  spaceKeys: string[];
}

export interface Terms {
  dueDate: string;
  scope: string;
  size: number;
}

export interface Card {
  id: string;
  title: string;
  state: State;
  neededBy: string;
  terms: Terms;
  pendingTerms: Terms | null;
  confidence: number | null;
  committedConfidence: number | null;
  goalWeight: number;
  sourceIssueKey: string;
  ownerIssueKey: string | null;
  owner: TeamLite | null;
  requester: TeamLite | null;
  side: Side | null;
  actions: string[];
  lateBy: number;
  updatedAt: string;
}

export interface Impact {
  commitmentId: string;
  title: string;
  requesterTeamId: string;
  confidenceBefore: number;
  confidenceAfter: number;
  slipDays: number;
}

export interface Option {
  kind: 'as_asked' | 'later_date' | 'jump_queue' | 'split_scope';
  dueDate: string;
  size: number;
  confidence: number;
  confidenceByNeeded: number;
  meetsNeededBy: boolean;
  impacts: Impact[];
  remainder?: { size: number; dueDate: string; confidence: number };
  score: number;
}

export interface Negotiation {
  neededBy: string;
  options: Option[];
  recommended: Option;
  verdict: 'easy' | 'tight' | 'needs_tradeoff' | 'later' | 'not_this_quarter';
  curve: CurvePoint[];
  basis: 'history' | 'declared';
}

export interface CurvePoint {
  date: string;
  probability: number;
}

export interface Bootstrap {
  accountId?: string;
  teams: TeamLite[];
  myTeams: string[];
  here: string | null;
  issueKey: string | null;
  moduleKey: string | null;
}
