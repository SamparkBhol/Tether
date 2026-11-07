export const TEAMS_BY_SPACE = `
query tether_teamsBySpace($spaceAri: ID!) {
  atlassianTeamsBySpace(spaceAri: $spaceAri, first: 10) {
    edges { node { __typename ... on AtlassianTeam { id displayName profileUrl smallAvatarImageUrl } } }
  }
}`;

export const SPACES_BY_TEAM = `
query tether_spacesByTeam($teamAri: ID!) {
  spacesByAtlassianTeam(teamAri: $teamAri, first: 25) {
    edges { node { __typename ... on JiraSpace { id key name } } }
  }
}`;

export const TEAMS_OF_USER = `
query tether_teamsOfUser($userId: ID!) {
  atlassianUserInTeams(userId: $userId, first: 25) {
    edges { node { __typename ... on AtlassianTeam { id displayName profileUrl smallAvatarImageUrl } } }
  }
}`;

export const TEAM_MEMBERS = `
query tether_teamMembers($teamAri: ID!) {
  atlassianTeamMembers(teamAri: $teamAri, first: 25) {
    edges { node { __typename ... on AtlassianUser { id accountId name } } }
  }
}`;

export const WORK_ITEM_GOALS = `
query tether_workItemGoals($id: ID!) {
  jiraWorkItemGoals(id: $id, first: 10) {
    edges { node { __typename ... on AtlassianGoal { id key name url archived dueDateEndedAt dueDateStartedAt } } }
  }
}`;

export const GOAL_LATEST_UPDATE = `
query tether_goalLatest($goalId: ID!) {
  atlassianGoalUpdates(goalId: $goalId, first: 1) {
    edges { node { __typename ... on AtlassianGoalUpdate { newState targetDateAt createdAt summary } } }
  }
}`;

export const WORK_ITEM_DEPLOYMENTS = `
query tether_workItemDeployments($id: ID!) {
  jiraWorkItemLinkedExternalDeployments(id: $id, first: 10) {
    edges { node { __typename ... on ExternalDeployment { id displayName state lastUpdatedAt url environment { type displayName } } } }
  }
}`;

export const WORK_ITEM_PULL_REQUESTS = `
query tether_workItemPullRequests($id: ID!) {
  jiraWorkItemLinkedExternalPullRequests(id: $id, first: 10) {
    edges { node { __typename ... on ExternalPullRequest { id displayName status lastUpdatedAt url } } }
  }
}`;
