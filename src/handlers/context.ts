import { isOpen, isPending } from '../domain/commitment';
import { touchingIssues } from '../store/commitments';

interface Payload {
  extension?: { issue?: { key?: string } };
}

const lozenge = (label: string, type: 'default' | 'inprogress' | 'moved' | 'new' | 'removed' | 'success') => ({
  status: { type: 'lozenge', value: { label, type } },
});

export const contextStatus = async (payload: Payload) => {
  const key = payload.extension?.issue?.key;
  if (!key) return {};
  try {
    const rows = (await touchingIssues([key])).filter((c) => c.sourceIssueKey === key && (isOpen(c.state) || isPending(c.state)));
    if (!rows.length) return {};
    const risky = rows.filter((c) => c.state === 'at_risk' || c.state === 'renegotiating').length;
    const waiting = rows.filter((c) => isPending(c.state)).length;
    if (risky) return lozenge(`${risky} at risk`, 'moved');
    if (waiting) return lozenge(`${waiting} waiting`, 'new');
    return lozenge(`${rows.length} on track`, 'success');
  } catch {
    return {};
  }
};
