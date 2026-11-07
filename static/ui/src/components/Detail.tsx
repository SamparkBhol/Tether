import { useCall } from '../api';
import { dayLabel, pct } from '../format';
import type { Card, CurvePoint, Negotiation } from '../types';
import { ActionBar } from './ActionBar';
import { IssueLink, Loading, Problem } from './bits';
import { Curve } from './Curve';
import { Options } from './Options';

interface DetailData {
  commitment: Card;
  issues: { key: string; summary: string; status: string; statusCategory: string }[];
  forecast: { basis: string; windowEnd: string | null; probability: number; dates: { p50: string; p85: string }; curve: CurvePoint[]; itemsAhead: number };
  negotiation: Negotiation | null;
  history: { type: string; at: string; side: string; agent: string | null; reason: string | null; to: string }[];
  trend: { date: string; probability: number }[];
}

const EVENT_WORDS: Record<string, string> = {
  raised: 'Asked',
  accepted: 'Committed',
  countered: 'Countered',
  declined: 'Declined',
  withdrawn: 'Withdrawn',
  reproposed: 'Proposed again',
  slipped: 'Slipped',
  recovered: 'Back on track',
  renegotiation_opened: 'New terms proposed',
  renegotiation_accepted: 'New terms agreed',
  renegotiation_rejected: 'Kept original terms',
  delivered: 'Delivered',
  broken: 'Missed',
};

const basisLine = (basis: string, windowEnd: string | null, ahead: number) => {
  const pace =
    basis === 'live'
      ? 'their pace over the last 60 working days'
      : basis === 'past'
        ? `their pace in the 60 working days up to ${windowEnd ? dayLabel(windowEnd) : 'their last activity'}`
        : 'the capacity they declared';
  return `Based on ${pace}, with ${ahead} item${ahead === 1 ? '' : 's'} ahead in their queue.`;
};

const who = (side: string, agent: string | null) => (agent === 'policy' ? 'team policy' : agent ? 'Tether' : side === 'owner' ? 'owning team' : side === 'requester' ? 'asking team' : 'Tether');

export const Detail = ({ id, teamName, onChanged }: { id: string; teamName: (id: string) => string; onChanged: () => void }) => {
  const { data, error, loading, reload } = useCall<DetailData>('detail', { id }, [id]);
  if (loading && !data) return <Loading />;
  if (error) return <Problem message={error} onRetry={reload} />;
  if (!data) return null;
  const c = data.commitment;
  return (
    <div className="detail">
      <Curve points={data.forecast.curve} neededBy={c.neededBy} due={c.terms.dueDate} dueConfidence={data.forecast.probability} />
      <p className="detail-basis">
        {basisLine(data.forecast.basis, data.forecast.windowEnd, data.forecast.itemsAhead)} Half the time it lands by {dayLabel(data.forecast.dates.p50)}, and 85% of
        the time by {dayLabel(data.forecast.dates.p85)}.
      </p>
      {data.negotiation && c.state !== 'committed' && <Options negotiation={data.negotiation} teamName={teamName} />}
      <ActionBar
        card={c}
        suggestion={data.negotiation && data.negotiation.recommended.kind !== 'as_asked' ? data.negotiation.recommended : null}
        onDone={() => {
          void reload();
          onChanged();
        }}
      />
      <div className="detail-links">
        {data.issues.map((i) => (
          <span key={i.key} className="detail-issue">
            <IssueLink k={i.key} /> {i.summary} <span className="muted">({i.status})</span>
          </span>
        ))}
      </div>
      <ol className="history">
        {data.history.map((h, i) => (
          <li key={i}>
            <span className="history-what">{EVENT_WORDS[h.type] ?? h.type}</span>
            <span className="muted"> by {who(h.side, h.agent)}, {new Date(h.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
            {h.reason && <span className="history-why">{h.reason}</span>}
          </li>
        ))}
      </ol>
      {data.trend.length > 1 && (
        <p className="muted small">
          Forecast moved from {pct(data.trend[0].probability)} on {dayLabel(data.trend[0].date)} to {pct(data.trend[data.trend.length - 1].probability)} today.
        </p>
      )}
    </div>
  );
};
