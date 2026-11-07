import { useCall, useChanges } from '../api';
import { Loading, Problem } from '../components/bits';
import { dayLabel, pct } from '../format';
import { gapText, livery, sector } from '../livery';
import type { Card } from '../types';

interface Data {
  issue: { key: string };
  waitingOn: Card[];
  readiness: { p50: string; p85: string } | null;
}

const LIVE = new Set(['proposed', 'countered', 'committed', 'at_risk', 'renegotiating']);

export const Glance = () => {
  const { data, error, loading, reload } = useCall<Data>('panel', {}, []);
  useChanges(() => void reload(), (c) => !!data && c.issues.includes(data.issue.key));
  if (loading && !data) return <Loading />;
  if (error) return <Problem message={error} onRetry={reload} />;
  if (!data) return null;
  const open = data.waitingOn.filter((c) => LIVE.has(c.state));
  if (!open.length) return <p className="glance-empty">Not waiting on any other team. Use Ask another team in the Tether panel below.</p>;
  return (
    <div className="glance">
      {data.readiness && (
        <p className="glance-verdict">
          All of it by <strong>{dayLabel(data.readiness.p85)}</strong> <span className="muted">85% sure</span>
        </p>
      )}
      <ul className="glance-list">
        {open.map((c) => (
          <li key={c.id} style={{ ['--stripe' as string]: livery(c.owner?.id) }}>
            <span className="glance-team">{c.owner?.name}</span>
            <span className="glance-when">
              {dayLabel(c.pendingTerms && c.state === 'renegotiating' ? c.pendingTerms.dueDate : c.terms.dueDate)}
              {c.delta !== null ? <span className={`gap gap-${sector(c.delta)}`}>{gapText(c.delta)}</span> : <span className="glance-odds">{pct(c.confidence)}</span>}
            </span>
          </li>
        ))}
      </ul>
      <p className="muted small">Details and answers are in the Tether panel below the description.</p>
    </div>
  );
};
