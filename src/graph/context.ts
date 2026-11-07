import type { Goal } from '../domain/types';
import type { As } from '../jira/client';
import { issueAri, spaceAri, userAri } from './ari';
import { graphQuery, nodes, safely } from './client';
import {
  GOAL_LATEST_UPDATE,
  SPACES_BY_TEAM,
  TEAMS_BY_SPACE,
  TEAMS_OF_USER,
  TEAM_MEMBERS,
  WORK_ITEM_DEPLOYMENTS,
  WORK_ITEM_GOALS,
  WORK_ITEM_PULL_REQUESTS,
} from './queries';

export interface GraphTeam {
  id: string;
  name: string;
  profileUrl?: string;
  avatarUrl?: string;
}

interface TeamNode {
  __typename: string;
  id: string;
  displayName?: string;
  profileUrl?: string;
  smallAvatarImageUrl?: string;
}

const toTeam = (n: TeamNode): GraphTeam => ({
  id: n.id,
  name: n.displayName ?? 'Unnamed team',
  profileUrl: n.profileUrl,
  avatarUrl: n.smallAvatarImageUrl,
});

export interface GraphScope {
  as: As;
  cloudId: string;
  installContext?: string;
}

const q = <T>(s: GraphScope, query: string, vars: Record<string, unknown>) => graphQuery<T>(s.as, query, vars, s.installContext);

export const teamsForSpace = (s: GraphScope, projectId: string) =>
  safely<GraphTeam[]>([], async () => {
    const d = await q<{ atlassianTeamsBySpace: never }>(s, TEAMS_BY_SPACE, { spaceAri: spaceAri(s.cloudId, projectId) });
    return nodes<TeamNode>(d.atlassianTeamsBySpace).filter((n) => n.__typename === 'AtlassianTeam').map(toTeam);
  });

export const spacesForTeam = (s: GraphScope, teamAri: string) =>
  safely<{ id: string; key: string; name: string }[]>([], async () => {
    const d = await q<{ spacesByAtlassianTeam: never }>(s, SPACES_BY_TEAM, { teamAri });
    return nodes<{ __typename: string; id: string; key: string; name: string }>(d.spacesByAtlassianTeam)
      .filter((n) => n.__typename === 'JiraSpace')
      .map(({ id, key, name }) => ({ id, key, name }));
  });

export const teamsOfUser = (s: GraphScope, accountId: string) =>
  safely<GraphTeam[]>([], async () => {
    const d = await q<{ atlassianUserInTeams: never }>(s, TEAMS_OF_USER, { userId: userAri(accountId) });
    return nodes<TeamNode>(d.atlassianUserInTeams).filter((n) => n.__typename === 'AtlassianTeam').map(toTeam);
  });

export const teamMembers = (s: GraphScope, teamAri: string) =>
  safely<{ accountId: string; name: string }[]>([], async () => {
    const d = await q<{ atlassianTeamMembers: never }>(s, TEAM_MEMBERS, { teamAri });
    return nodes<{ __typename: string; accountId: string; name: string }>(d.atlassianTeamMembers)
      .filter((n) => n.__typename === 'AtlassianUser')
      .map(({ accountId, name }) => ({ accountId, name }));
  });

interface GoalNode {
  __typename: string;
  id: string;
  key?: string;
  name?: string;
  url?: string;
  archived?: boolean;
  dueDateEndedAt?: string;
  dueDateStartedAt?: string;
}

const goalState = (s: GraphScope, goalId: string) =>
  safely<{ state?: string; target?: string }>({}, async () => {
    const d = await q<{ atlassianGoalUpdates: never }>(s, GOAL_LATEST_UPDATE, { goalId });
    const u = nodes<{ newState?: string; targetDateAt?: string }>(d.atlassianGoalUpdates)[0];
    return { state: u?.newState, target: u?.targetDateAt };
  });

export const goalsForIssue = (s: GraphScope, issueId: string) =>
  safely<Goal[]>([], async () => {
    const d = await q<{ jiraWorkItemGoals: never }>(s, WORK_ITEM_GOALS, { id: issueAri(s.cloudId, issueId) });
    const goals = nodes<GoalNode>(d.jiraWorkItemGoals).filter((g) => g.__typename === 'AtlassianGoal' && !g.archived);
    return Promise.all(
      goals.map(async (g) => {
        const st = await goalState(s, g.id);
        const due = (st.target ?? g.dueDateEndedAt ?? g.dueDateStartedAt)?.slice(0, 10);
        return { id: g.id, name: g.name ?? g.key ?? 'Goal', url: g.url, state: st.state, dueDate: due };
      }),
    );
  });

export interface DeliveryEvidence {
  deployments: { name: string; state: string; environment?: string; at?: string; url?: string }[];
  pullRequests: { name: string; status: string; at?: string; url?: string }[];
  shippedToProduction: boolean;
}

export const deliveryForIssue = (s: GraphScope, issueId: string) =>
  safely<DeliveryEvidence>({ deployments: [], pullRequests: [], shippedToProduction: false }, async () => {
    const id = issueAri(s.cloudId, issueId);
    const [deps, prs] = await Promise.all([
      q<{ jiraWorkItemLinkedExternalDeployments: never }>(s, WORK_ITEM_DEPLOYMENTS, { id }),
      q<{ jiraWorkItemLinkedExternalPullRequests: never }>(s, WORK_ITEM_PULL_REQUESTS, { id }),
    ]);
    const deployments = nodes<{
      displayName?: string;
      state?: string;
      lastUpdatedAt?: string;
      url?: string;
      environment?: { type?: string; displayName?: string };
    }>(deps.jiraWorkItemLinkedExternalDeployments).map((d) => ({
      name: d.displayName ?? 'Deployment',
      state: d.state ?? 'UNKNOWN',
      environment: d.environment?.type ?? d.environment?.displayName,
      at: d.lastUpdatedAt,
      url: d.url,
    }));
    const pullRequests = nodes<{ displayName?: string; status?: string; lastUpdatedAt?: string; url?: string }>(
      prs.jiraWorkItemLinkedExternalPullRequests,
    ).map((p) => ({ name: p.displayName ?? 'Pull request', status: p.status ?? 'UNKNOWN', at: p.lastUpdatedAt, url: p.url }));
    const shippedToProduction = deployments.some(
      (d) => d.state === 'SUCCESSFUL' && /prod/i.test(d.environment ?? ''),
    );
    return { deployments, pullRequests, shippedToProduction };
  });
