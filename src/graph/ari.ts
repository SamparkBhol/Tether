export const issueAri = (cloudId: string, issueId: string) => `ari:cloud:jira:${cloudId}:issue/${issueId}`;
export const spaceAri = (cloudId: string, projectId: string) => `ari:cloud:jira:${cloudId}:project/${projectId}`;
export const userAri = (accountId: string) => `ari:cloud:identity::user/${accountId}`;

export const tailId = (ari: string) => ari.slice(ari.lastIndexOf('/') + 1);
export const isTeamAri = (id: string) => id.startsWith('ari:cloud:identity::team/');
