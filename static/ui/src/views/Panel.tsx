import Button from '@atlaskit/button/new';
import { Modal, rovo } from '@forge/bridge';
import { useEffect, useState } from 'react';
import { useCall, useChanges } from '../api';
import { Loading, Problem, Section } from '../components/bits';
import { Row } from '../components/Row';
import { dayLabel } from '../format';
import type { Bootstrap, Card, CurvePoint } from '../types';

interface PanelData {
  issue: { key: string; summary: string; projectKey: string };
  waitingOn: Card[];
  promisedTo: Card[];
  readiness: { p50: string; p85: string; p95: string; curve: CurvePoint[]; dependencies: number } | null;
}

export const Panel = ({ boot }: { boot: Bootstrap }) => {
  const { data, error, loading, reload } = useCall<PanelData>('panel', {}, []);
  const [rovoOn, setRovoOn] = useState(false);
  const names = new Map(boot.teams.map((t) => [t.id, t.name]));
  const teamName = (id: string) => names.get(id) ?? 'another team';

  useEffect(() => {
    rovo.isEnabled().then(setRovoOn).catch(() => setRovoOn(false));
  }, []);
  useChanges(() => void reload(), (c) => !!data && c.issues.includes(data.issue.key));

  if (loading && !data) return <Loading />;
  if (error) return <Problem message={error} onRetry={reload} />;
  if (!data) return null;

  const ask = () =>
    new Modal({ resource: 'ui', size: 'large', context: { mode: 'ask', issueKey: data.issue.key }, onClose: () => void reload() }).open();

  const askTether = () =>
    rovo.open({
      type: 'forge',
      agentKey: 'tether-agent',
      agentName: 'Tether',
      prompt: data.waitingOn.some((c) => c.state === 'at_risk' || c.state === 'renegotiating')
        ? `Something ${data.issue.key} needs from another team is slipping. Explain why, what it pushes back, and what I can do.`
        : `What is ${data.issue.key} waiting on from other teams, and is any of it at risk?`,
    });

  const open = data.waitingOn.filter((c) => !['delivered', 'declined', 'withdrawn'].includes(c.state));

  return (
    <div className="panel">
      {data.readiness && open.length > 0 && (
        <p className="readiness">
          Everything this needs from other teams lands by <strong>{dayLabel(data.readiness.p85)}</strong> 85% of the time, and by{' '}
          {dayLabel(data.readiness.p50)} half the time.
        </p>
      )}
      <Section
        title="Waiting on other teams"
        aside={
          <span className="section-actions">
            {rovoOn && (
              <Button appearance="subtle" spacing="compact" onClick={askTether}>
                Ask in Rovo
              </Button>
            )}
            {data.waitingOn.length > 0 && (
              <Button appearance="primary" spacing="compact" onClick={ask}>
                Ask another team
              </Button>
            )}
          </span>
        }
      >
        {data.waitingOn.length ? (
          <ul className="rows">
            {data.waitingOn.map((c) => (
              <Row key={c.id} card={c} perspective="requester" teamName={teamName} onChanged={reload} />
            ))}
          </ul>
        ) : (
          <div className="cta">
            <svg className="cta-mark" viewBox="0 0 64 24" aria-hidden="true">
              <path d="M8 12 C 24 2, 40 22, 56 12" />
              <circle cx="8" cy="12" r="6" className="cta-a" />
              <circle cx="56" cy="12" r="6" className="cta-b" />
            </svg>
            <div className="cta-text">
              <p className="cta-title">Need something from another team?</p>
              <p>A review, an API, a sign-off. Ask here and you'll get a real date with odds, not a "we'll try".</p>
            </div>
            <Button appearance="primary" onClick={ask}>
              Ask another team
            </Button>
          </div>
        )}
      </Section>
      {data.promisedTo.length > 0 && (
        <Section title="Promised to other teams">
          <ul className="rows">
            {data.promisedTo.map((c) => (
              <Row key={c.id} card={c} perspective="owner" teamName={teamName} onChanged={reload} />
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
};
