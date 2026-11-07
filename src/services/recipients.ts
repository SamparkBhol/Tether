import type { Team } from '../domain/types';
import { isTeamAri } from '../graph/ari';
import { teamMembers } from '../graph/context';
import { asApp } from '../jira/client';
import { listProjects } from '../jira/projects';
import { log } from '../lib/util';
import { graphScope, type Scope } from './scope';

export const ownerRecipients = async (s: Scope, owner: Team, exclude?: string): Promise<string[]> => {
  const out = new Set<string>();
  try {
    const projects = await listProjects(asApp);
    for (const p of projects) if (owner.spaceKeys.includes(p.key) && p.leadAccountId) out.add(p.leadAccountId);
  } catch (e) {
    log('recipients.leads_failed', { message: (e as Error).message });
  }
  if (isTeamAri(owner.id) && !s.system) for (const m of await teamMembers(graphScope(s), owner.id)) out.add(m.accountId);
  if (exclude) out.delete(exclude);
  return [...out];
};
