export interface Link {
  id: string;
  sourceIssueKey: string;
  ownerIssueKey?: string;
}

export interface CommitmentGraph {
  upstreamOf: Map<string, string[]>;
  downstreamOf: Map<string, string[]>;
  order: string[];
  cycles: string[][];
}

export const buildGraph = (links: Link[], parentOf: (issueKey: string) => string | undefined): CommitmentGraph => {
  const byOwnerIssue = new Map<string, string[]>();
  for (const l of links) {
    if (!l.ownerIssueKey) continue;
    byOwnerIssue.set(l.ownerIssueKey, [...(byOwnerIssue.get(l.ownerIssueKey) ?? []), l.id]);
  }

  const upstreamOf = new Map<string, string[]>(links.map((l) => [l.id, []]));
  const downstreamOf = new Map<string, string[]>(links.map((l) => [l.id, []]));

  for (const up of links) {
    const seen = new Set<string>();
    let key: string | undefined = up.sourceIssueKey;
    for (let depth = 0; key && depth < 6 && !seen.has(key); depth++) {
      seen.add(key);
      for (const down of byOwnerIssue.get(key) ?? []) {
        if (down === up.id) continue;
        upstreamOf.get(down)!.push(up.id);
        downstreamOf.get(up.id)!.push(down);
      }
      key = parentOf(key);
    }
  }

  const indegree = new Map([...upstreamOf].map(([id, ups]) => [id, ups.length]));
  const ready = [...indegree].filter(([, d]) => d === 0).map(([id]) => id);
  const order: string[] = [];
  while (ready.length) {
    const id = ready.shift()!;
    order.push(id);
    for (const d of downstreamOf.get(id) ?? []) {
      const left = indegree.get(d)! - 1;
      indegree.set(d, left);
      if (left === 0) ready.push(d);
    }
  }

  const stuck = new Set([...indegree].filter(([, d]) => d > 0).map(([id]) => id));
  const cycles: string[][] = [];
  const visited = new Set<string>();
  for (const start of stuck) {
    if (visited.has(start)) continue;
    const path: string[] = [];
    let cur: string | undefined = start;
    while (cur && !path.includes(cur)) {
      path.push(cur);
      visited.add(cur);
      cur = (upstreamOf.get(cur) ?? []).find((u) => stuck.has(u));
    }
    if (cur) cycles.push(path.slice(path.indexOf(cur)));
  }

  return { upstreamOf, downstreamOf, order: [...order, ...[...stuck].sort()], cycles };
};

export const wouldCycle = (links: Link[], candidate: Link, parentOf: (k: string) => string | undefined) =>
  buildGraph([...links, candidate], parentOf).cycles.some((c) => c.includes(candidate.id));

export const reachDownstream = (g: CommitmentGraph, id: string): string[] => {
  const out: string[] = [];
  const stack = [...(g.downstreamOf.get(id) ?? [])];
  while (stack.length) {
    const d = stack.pop()!;
    if (out.includes(d)) continue;
    out.push(d);
    stack.push(...(g.downstreamOf.get(d) ?? []));
  }
  return out;
};
