import { jira, route, type As } from './client';

export interface ProjectLite {
  id: string;
  key: string;
  name: string;
  type: string;
  avatarUrl?: string;
  leadAccountId?: string;
}

interface RawProject {
  id: string;
  key: string;
  name: string;
  projectTypeKey: string;
  avatarUrls?: Record<string, string>;
  lead?: { accountId: string };
}

export const listProjects = async (as: As): Promise<ProjectLite[]> => {
  const out: ProjectLite[] = [];
  for (let start = 0; start < 1000; start += 50) {
    const page = await jira<{ values: RawProject[]; isLast: boolean }>(
      as,
      route`/rest/api/3/project/search?startAt=${String(start)}&maxResults=50&expand=lead`,
      'list spaces',
    );
    out.push(
      ...page.values.map((p) => ({
        id: p.id,
        key: p.key,
        name: p.name,
        type: p.projectTypeKey,
        avatarUrl: p.avatarUrls?.['48x48'],
        leadAccountId: p.lead?.accountId,
      })),
    );
    if (page.isLast) break;
  }
  return out;
};
