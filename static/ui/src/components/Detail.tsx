import { call, useCall } from '../api';
import { dayLabel, pct } from '../format';
import type { Card, CurvePoint, Negotiation } from '../types';
import { ActionBar } from './ActionBar';
import { IssueLink, Loading, Problem } from './bits';
import { Forecast, type ForecastInputs } from './Forecast';
import { Options } from './Options';

interface DetailData {
  commitment: Card;
  issues: {
    key: string;
    summary: string;
    status: string;
    statusCategory: string;
  }[];
  forecast: {
    basis: string;
    windowEnd: string | null;
    probability: number;
    dates: { p50: string; p85: string };
    curve: CurvePoint[];
    histogram: { date: string; share: number }[];
    inputs: ForecastInputs;
    itemsAhead: number;
  };
  negotiation: Negotiation | null;
  history: {
    type: string;
    at: string;
    side: string;
    agent: string | null;
    reason: string | null;
    to: string;
  }[];
  trend: { date: string; probability: number }[];
  delivery: { deployments: { name: string; state: string; environment?: string }[]; pullRequests: { name: string; status: string }[]; shippedToProduction: boolean } | null;
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

const who = (side: string, agent: string | null) =>
  agent === 'policy' ? 'team policy' : agent ? 'Tether' : side === 'owner' ? 'owning team' : side === 'requester' ? 'asking team' : 'Tether';

const trendLine = (t: { date: string; probability: number }[]) => {
  const from = pct(t[0].probability);
  const to = pct(t[t.length - 1].probability);
  return from === to ? `Forecast has held at ${to} since ${dayLabel(t[0].date)}.` : `Forecast moved from ${from} on ${dayLabel(t[0].date)} to ${to} today.`;
};

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

const deliveryLine = (d: NonNullable<DetailData['delivery']>, key: string | null) => {
  const parts = [];
  if (d.pullRequests.length) parts.push(plural(d.pullRequests.length, 'pull request'));
  if (d.deployments.length) parts.push(plural(d.deployments.length, d.shippedToProduction ? 'deployment, including production,' : 'deployment'));
  return `From the Teamwork Graph: ${parts.join(' and ')} linked to ${key ?? 'the work'}.`;
};

export const Detail = ({ id, teamName, onChanged }: { id: string; teamName: (id: string) => string; onChanged: () => void }) => {
  const { data, error, loading, reload } = useCall<DetailData>('detail', { id }, [id]);
  if (loading && !data) return <Loading />;
  if (error) return <Problem message={error} onRetry={reload} />;
  if (!data) return null;
  const c = data.commitment;
  const requesterMove = c.state === 'renegotiating' || c.state === 'countered';
  const joinTeam = requesterMove ? c.requester : c.state === 'proposed' ? c.owner : null;
  const needsJoin = !!joinTeam && !c.actions.some((a) => ['accept', 'acceptRenegotiation', 'counter'].includes(a));
  return (
    <div className="detail">
      <div className="detail-body">
        <div className="detail-chart">
          <Forecast
            curve={data.forecast.curve}
            histogram={data.forecast.histogram}
            inputs={data.forecast.inputs}
            team={c.owner?.name}
            windowEnd={data.forecast.windowEnd}
            neededBy={c.terms.dueDate}
            neededConfidence={data.forecast.probability}
            proposal={c.pendingTerms && (c.state === 'renegotiating' || c.state === 'countered') ? c.pendingTerms.dueDate : undefined}
            proposalConfidence={c.pendingTerms?.confidence}
            proposalLabel={c.pendingTerms ? 'Proposed' : undefined}
          />
          <p className="detail-basis">
            Half the time it lands by <strong>{dayLabel(data.forecast.dates.p50)}</strong>, and 85% of the time by{' '}
            <strong>{dayLabel(data.forecast.dates.p85)}</strong>.
          </p>
        </div>
        <div className="detail-side">
          {data.negotiation && c.state !== 'committed' && <Options negotiation={data.negotiation} teamName={teamName} />}
          {needsJoin && joinTeam && (
            <p className="join-hint">
              Only {joinTeam.name} can answer this.{' '}
              <button
                className="link"
                onClick={async () => {
                  await call('pin', { teamId: joinTeam.id, on: true });
                  onChanged();
                  void reload();
                }}
              >
                I'm on {joinTeam.name}
              </button>
            </p>
          )}
          <ActionBar
            card={c}
            suggestion={data.negotiation && data.negotiation.recommended.kind !== 'as_asked' ? data.negotiation.recommended : null}
            onDone={() => {
              void reload();
              onChanged();
            }}
          />
          {data.delivery && (data.delivery.deployments.length > 0 || data.delivery.pullRequests.length > 0) && (
        <p className={`delivery ${data.delivery.shippedToProduction ? 'delivery-shipped' : ''}`}>
          {deliveryLine(data.delivery, c.ownerIssueKey)}
          {data.delivery.shippedToProduction && c.side === 'owner' && c.actions.includes('deliver') ? ' It looks shipped, so you can mark it delivered.' : ''}
        </p>
      )}
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
                <span className="muted">
                  {' '}
                  by {who(h.side, h.agent)},{' '}
                  {new Date(h.at).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </span>
                {h.reason && <span className="history-why">{h.reason}</span>}
              </li>
            ))}
          </ol>
          {data.trend.length > 1 && <p className="muted small">{trendLine(data.trend)}</p>}
        </div>
      </div>
    </div>
  );
};
