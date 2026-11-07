export type IsoDate = string;
export type IsoInstant = string;

export type Channel = 'jira' | 'rovo' | 'mcp' | 'confluence';

export type CommitmentState =
  | 'proposed'
  | 'countered'
  | 'committed'
  | 'at_risk'
  | 'renegotiating'
  | 'delivered'
  | 'broken'
  | 'declined'
  | 'withdrawn';

export type Side = 'requester' | 'owner' | 'system';

export interface Actor {
  side: Side;
  accountId?: string;
  agent?: string;
}

export interface Team {
  id: string;
  name: string;
  source: 'graph' | 'space';
  spaceKeys: string[];
  avatarUrl?: string;
  profileUrl?: string;
}

export interface Terms {
  dueDate: IsoDate;
  scope: string;
  size: number;
}

export interface Ask {
  id: string;
  requesterTeamId: string;
  ownerTeamId: string;
  sourceIssueKey: string;
  title: string;
  detail: string;
  neededBy: IsoDate;
  goalIds: string[];
  createdBy: string;
  channel: Channel;
  agentClient?: string;
  createdAt: IsoInstant;
}

export interface Commitment {
  id: string;
  askId: string;
  requesterTeamId: string;
  ownerTeamId: string;
  sourceIssueKey: string;
  ownerIssueKey?: string;
  title: string;
  state: CommitmentState;
  neededBy: IsoDate;
  terms: Terms;
  pendingTerms?: Terms;
  goalWeight: number;
  confidence?: number;
  committedConfidence?: number;
  deliveredAt?: IsoInstant;
  version: number;
  createdAt: IsoInstant;
  updatedAt: IsoInstant;
}

export type EventType =
  | 'raised'
  | 'accepted'
  | 'countered'
  | 'declined'
  | 'withdrawn'
  | 'reproposed'
  | 'slipped'
  | 'recovered'
  | 'renegotiation_opened'
  | 'renegotiation_accepted'
  | 'renegotiation_rejected'
  | 'delivered'
  | 'broken';

export interface CommitmentEvent {
  id: string;
  commitmentId: string;
  type: EventType;
  actor: Actor;
  at: IsoInstant;
  reason?: string;
  from: CommitmentState;
  to: CommitmentState;
  data?: Record<string, unknown>;
}

export interface TeamPolicy {
  teamId: string;
  riskThreshold: number;
  targetConfidence: number;
  askShare: number;
  declaredDailyCapacity: number;
  autoAcceptMaxSize: number;
  autoAcceptGoalAligned: boolean;
  nonWorkingDates: IsoDate[];
  workingWeekdays: number[];
  version: number;
}

export interface ForecastSnapshot {
  commitmentId: string;
  takenAt: IsoInstant;
  seed: number;
  trials: number;
  basis: 'history' | 'declared';
  probabilityByDue: number;
  p50: IsoDate;
  p70: IsoDate;
  p85: IsoDate;
  p95: IsoDate;
}

export interface Goal {
  id: string;
  name: string;
  url?: string;
  state?: string;
  dueDate?: IsoDate;
}
