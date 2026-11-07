import type { Team } from '../domain/types';
import { teamsOfUser } from '../graph/context';
import { jiraMaybe, route } from '../jira/client';
import { getTeam } from '../store/records';
import { graphScope, type Scope } from './scope';

interface Permissions {
  permissions?: Record<string, { havePermission?: boolean }>;
}

export class Access {
  private graph: Promise<Set<string>> | null = null;
  private spaces = new Map<string, Promise<boolean>>();

  constructor(private readonly s: Scope) {}

  private graphTeams() {
    if (!this.graph)
      this.graph = this.s.accountId
        ? teamsOfUser(graphScope(this.s), this.s.accountId).then((ts) => new Set(ts.map((t) => t.id)))
        : Promise.resolve(new Set<string>());
    return this.graph;
  }

  private canWork(projectKey: string) {
    let p = this.spaces.get(projectKey);
    if (!p) {
      p = jiraMaybe<Permissions>(this.s.as, route`/rest/api/3/mypermissions?projectKey=${projectKey}&permissions=CREATE_ISSUES,EDIT_ISSUES`, 'check permissions').then(
        (r) => !!r?.permissions?.CREATE_ISSUES?.havePermission && !!r?.permissions?.EDIT_ISSUES?.havePermission,
      );
      this.spaces.set(projectKey, p);
    }
    return p;
  }

  async canActFor(team: Team | undefined | null): Promise<boolean> {
    if (!team || this.s.system) return !!team;
    if ((await this.graphTeams()).has(team.id)) return true;
    const key = team.spaceKeys[0];
    return key ? this.canWork(key) : false;
  }

  async acting(teamIds: string[]): Promise<string[]> {
    const out: string[] = [];
    for (const id of new Set(teamIds)) if (await this.canActFor(await getTeam(id))) out.push(id);
    return out;
  }
}

export const access = (s: Scope) => new Access(s);
