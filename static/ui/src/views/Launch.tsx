import Button from '@atlaskit/button/new';
import { view } from '@forge/bridge';
import { useState } from 'react';
import { useCall, useChanges } from '../api';
import { Empty, IssueLink, Loading, Problem } from '../components/bits';
import { Forecast } from '../components/Forecast';
import { Row } from '../components/Row';
import { dayLabel, pct } from '../format';
import type { Bootstrap, Card, CurvePoint } from '../types';

interface LaunchData {
  issue: { key: string; summary: string; dueDate: string | null };
  waitingOn: Card[];
  readiness: { p50: string; p85: string; p95: string; curve: CurvePoint[]; dependencies: number } | null;
}

const chanceBy = (curve: CurvePoint[], iso: string) => {
  let p = 0;
  for (const pt of curve) if (pt.date <= iso) p = pt.probability;
  return p;
};

export const Launch = ({ boot, issueKey }: { boot: Bootstrap; issueKey: string }) => {
  const { data, error, loading, reload } = useCall<LaunchData>('panel', { issueKey }, [issueKey]);
  const names = new Map(boot.teams.map((t) => [t.id, t.name]));
  useChanges(() => void reload(), (c) => !!data && c.issues.includes(data.issue.key));
  if (!issueKey) return <Empty title="Pick a launch">Edit this macro and choose the work item that tracks the launch.</Empty>;
  if (loading && !data) return <Loading />;
  if (error) return <Problem message={error} onRetry={reload} />;
  if (!data) return null;
  const open = data.waitingOn.filter((c) => !['delivered', 'declined', 'withdrawn'].includes(c.state));
  const due = data.issue.dueDate;
  const onTime = data.readiness && due ? chanceBy(data.readiness.curve, due) : null;
  return (
    <div className="launch">
      <p className="launch-head">
        <IssueLink k={data.issue.key} /> {data.issue.summary}
      </p>
      {data.readiness && open.length ? (
        <>
          <p className="launch-line">
            {due && onTime !== null ? (
              <>
                <strong>{pct(onTime)}</strong> chance everything from other teams lands by the launch date, {dayLabel(due)}.
              </>
            ) : (
              <>
                Everything from other teams lands by <strong>{dayLabel(data.readiness.p85)}</strong> 85% of the time.
              </>
            )}
          </p>
          <Forecast curve={data.readiness.curve} neededBy={due ?? undefined} proposal={data.readiness.p85} proposalLabel="Likely" />
        </>
      ) : (
        <Empty title="Nothing to wait on">This launch has no open asks to other teams.</Empty>
      )}
      <ul className="rows">
        {data.waitingOn.map((c) => (
          <Row key={c.id} card={c} perspective="requester" teamName={(id) => names.get(id) ?? 'another team'} onChanged={reload} linkTo="work" />
        ))}
      </ul>
    </div>
  );
};

export const LaunchConfig = ({ initial }: { initial: string }) => {
  const [key, setKey] = useState(initial);
  const valid = /^[A-Za-z][A-Za-z0-9_]+-\d+$/.test(key.trim());
  return (
    <form
      className="launch-config"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) void view.submit({ config: { issueKey: key.trim().toUpperCase() } });
      }}
    >
      <label htmlFor="launch-key">Work item that tracks the launch</label>
      <input id="launch-key" autoFocus placeholder="MC-42" value={key} onChange={(e) => setKey(e.target.value)} />
      <div className="act-buttons">
        <Button type="submit" appearance="primary" isDisabled={!valid}>
          Show readiness
        </Button>
      </div>
    </form>
  );
};
