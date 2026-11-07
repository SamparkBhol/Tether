import { chunk } from '../lib/util';
import { plain } from './adf';
import { jira, jiraMaybe, route, type As } from './client';

export interface IssueLite {
  id: string;
  key: string;
  summary: string;
  description: string;
  status: string;
  statusCategory: 'new' | 'indeterminate' | 'done' | string;
  projectKey: string;
  projectId: string;
  parentKey?: string;
  issueType: string;
  assigneeId?: string;
  dueDate?: string;
  url: string;
  blockedBy: { key: string; summary: string; projectKey: string; statusCategory: string }[];
}

interface RawIssue {
  id: string;
  key: string;
  self: string;
  fields: {
    summary?: string;
    description?: unknown;
    status?: { name: string; statusCategory?: { key: string } };
    project?: { key: string; id: string };
    parent?: { key: string };
    issuetype?: { name: string };
    assignee?: { accountId: string } | null;
    duedate?: string | null;
    issuelinks?: {
      type?: { name?: string };
      inwardIssue?: { key: string; fields?: { summary?: string; status?: { statusCategory?: { key?: string } } } };
    }[];
    statuscategorychangedate?: string;
    resolutiondate?: string | null;
  };
}

const FIELDS = 'summary,description,status,project,parent,issuetype,assignee,duedate,issuelinks';

const browseUrl = (self: string, key: string) => `${new URL(self).origin}/browse/${key}`;

const lite = (r: RawIssue): IssueLite => ({
  id: r.id,
  key: r.key,
  summary: r.fields.summary ?? '',
  description: plain(r.fields.description, 1500),
  status: r.fields.status?.name ?? '',
  statusCategory: r.fields.status?.statusCategory?.key ?? '',
  projectKey: r.fields.project?.key ?? r.key.split('-')[0],
  projectId: r.fields.project?.id ?? '',
  parentKey: r.fields.parent?.key,
  issueType: r.fields.issuetype?.name ?? '',
  assigneeId: r.fields.assignee?.accountId,
  dueDate: r.fields.duedate ?? undefined,
  url: browseUrl(r.self, r.key),
  blockedBy: (r.fields.issuelinks ?? [])
    .filter((l) => l.type?.name === 'Blocks' && l.inwardIssue)
    .map((l) => ({
      key: l.inwardIssue!.key,
      summary: l.inwardIssue!.fields?.summary ?? '',
      projectKey: l.inwardIssue!.key.split('-')[0],
      statusCategory: l.inwardIssue!.fields?.status?.statusCategory?.key ?? '',
    })),
});

export const getIssue = async (as: As, key: string): Promise<IssueLite | null> => {
  const r = await jiraMaybe<RawIssue>(as, route`/rest/api/3/issue/${key}?fields=${FIELDS}`, `read ${key}`);
  return r ? lite(r) : null;
};

interface SearchPage {
  issues: RawIssue[];
  nextPageToken?: string;
}

const search = async (as: As, jql: string, fields: string, cap: number): Promise<RawIssue[]> => {
  const out: RawIssue[] = [];
  let token: string | undefined;
  do {
    const page: SearchPage = await jira<SearchPage>(as, route`/rest/api/3/search/jql`, 'search work items', {
      method: 'POST',
      body: { jql, fields: fields.split(','), maxResults: Math.min(100, cap - out.length), nextPageToken: token },
    });
    out.push(...page.issues);
    token = page.nextPageToken;
  } while (token && out.length < cap);
  return out;
};

export const getIssues = async (as: As, keys: string[]): Promise<IssueLite[]> => {
  const out: IssueLite[] = [];
  for (const group of chunk([...new Set(keys)], 50)) {
    const rows = await search(as, `key in (${group.map((k) => `"${k}"`).join(',')})`, FIELDS, group.length);
    out.push(...rows.map(lite));
  }
  return out;
};

export const completions = async (as: As, projectKeys: string[], cap = 400): Promise<string[]> => {
  if (!projectKeys.length) return [];
  const keys = projectKeys.map((k) => `"${k}"`).join(',');
  const rows = await search(
    as,
    `project in (${keys}) AND statusCategory = Done ORDER BY statusCategoryChangedDate DESC`,
    'statuscategorychangedate,resolutiondate',
    cap,
  );
  return rows.map((r) => r.fields.statuscategorychangedate ?? r.fields.resolutiondate ?? '').filter(Boolean);
};

export const openWorkCount = async (as: As, projectKeys: string[]): Promise<number> => {
  if (!projectKeys.length) return 0;
  const keys = projectKeys.map((k) => `"${k}"`).join(',');
  const r = await jira<{ count: number }>(as, route`/rest/api/3/search/approximate-count`, 'count open work', {
    method: 'POST',
    body: { jql: `project in (${keys}) AND statusCategory = "In Progress"` },
  });
  return r?.count ?? 0;
};

interface MetaType {
  id: string;
  name: string;
  subtask: boolean;
  hierarchyLevel?: number;
}

interface CreateMeta {
  issueTypes?: MetaType[];
  values?: MetaType[];
}

export const pickIssueType = async (as: As, projectKey: string): Promise<string | null> => {
  const meta = await jiraMaybe<CreateMeta>(as, route`/rest/api/3/issue/createmeta/${projectKey}/issuetypes`, 'read issue types');
  const types = (meta?.issueTypes ?? meta?.values ?? []).filter((t) => !t.subtask && (t.hierarchyLevel ?? 0) === 0);
  const preferred = ['Task', 'Request', 'Story', 'Service request'];
  for (const name of preferred) {
    const hit = types.find((t) => t.name.toLowerCase() === name.toLowerCase());
    if (hit) return hit.id;
  }
  return types[0]?.id ?? null;
};

export const createIssue = async (
  as: As,
  input: { projectKey: string; issueTypeId: string; summary: string; description: unknown; labels?: string[]; dueDate?: string },
): Promise<{ id: string; key: string }> =>
  jira<{ id: string; key: string }>(as, route`/rest/api/3/issue`, `create work in ${input.projectKey}`, {
    method: 'POST',
    body: {
      fields: {
        project: { key: input.projectKey },
        issuetype: { id: input.issueTypeId },
        summary: input.summary.slice(0, 250),
        description: input.description,
        labels: input.labels,
        duedate: input.dueDate,
      },
    },
  });

export const setDueDate = (as: As, key: string, dueDate: string) =>
  jira<void>(as, route`/rest/api/3/issue/${key}`, `update ${key}`, { method: 'PUT', body: { fields: { duedate: dueDate } } });

export const linkBlocks = (as: As, blockerKey: string, blockedKey: string) =>
  jira<void>(as, route`/rest/api/3/issueLink`, 'link work items', {
    method: 'POST',
    body: { type: { name: 'Blocks' }, inwardIssue: { key: blockerKey }, outwardIssue: { key: blockedKey } },
  });

export const comment = (as: As, key: string, body: unknown) =>
  jira<void>(as, route`/rest/api/3/issue/${key}/comment`, `comment on ${key}`, { method: 'POST', body: { body } });

export const setProperty = (as: As, key: string, prop: string, value: unknown) =>
  jira<void>(as, route`/rest/api/3/issue/${key}/properties/${prop}`, `tag ${key}`, { method: 'PUT', body: value });

export const parentChain = async (as: As, keys: string[], depth = 3): Promise<Map<string, string>> => {
  const parents = new Map<string, string>();
  let frontier = [...new Set(keys)];
  for (let i = 0; i < depth && frontier.length; i++) {
    const issues = await getIssues(as, frontier);
    const next: string[] = [];
    for (const it of issues)
      if (it.parentKey && !parents.has(it.key)) {
        parents.set(it.key, it.parentKey);
        next.push(it.parentKey);
      }
    frontier = next.filter((k) => !parents.has(k));
  }
  return parents;
};
