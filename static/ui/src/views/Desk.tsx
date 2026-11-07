import Button from '@atlaskit/button/new';
import { showFlag } from '@forge/bridge';
import { useState } from 'react';
import { call, useCall, useChanges } from '../api';
import { Empty, Loading, Problem, Section, Team } from '../components/bits';
import { Row } from '../components/Row';
import { dayLabel, pct } from '../format';
import type { Bootstrap, Card, Negotiation, TeamLite } from '../types';

interface Policy {
  teamId: string;
  riskThreshold: number;
  targetConfidence: number;
  askShare: number;
  declaredDailyCapacity: number;
  autoAcceptMaxSize: number;
  autoAcceptGoalAligned: boolean;
  nonWorkingDates: string[];
  workingWeekdays: number[];
  version: number;
}

interface DeskData {
  team: TeamLite;
  member: boolean;
  model: { basis: string; windowEnd: string | null; perWeek: number; completed: number; askShare: number; shareSource: string; learnedFrom: number; policy: Policy };
  calibration: { samples: number; brier: number | null; hitRate: number | null; verdict: string };
  reliability: number | null;
  inbox: (Card & { detail: string; channel: string; agentClient: string | null; negotiation: Negotiation | null })[];
  promised: Card[];
  asked: Card[];
  closed: Card[];
}

const honesty = (c: DeskData['calibration']) =>
  c.verdict === 'learning'
    ? `Tether is still learning how accurate this team's dates are (${c.samples} of 5 delivered so far).`
    : c.verdict === 'honest'
      ? `This team's forecasts have been honest: they hit ${pct(c.hitRate)} of what they promised.`
      : c.verdict === 'optimistic'
        ? `This team's forecasts have run optimistic: they hit ${pct(c.hitRate)} of promises. Pad dates a little.`
        : `This team usually beats its forecasts (${pct(c.hitRate)} on time).`;

const pace = (d: DeskData) =>
  d.model.basis === 'declared'
    ? `No recent finished work in ${d.team.spaceKeys.join(', ')}, so forecasts use the capacity below.`
    : `Finishes about ${d.model.perWeek} items a week${d.model.basis === 'past' && d.model.windowEnd ? ` (history up to ${dayLabel(d.model.windowEnd)})` : ''}, about ${Math.round(d.model.askShare * 100)}% of it on asks from other teams${d.model.shareSource === 'learned' ? ` (learned from ${d.model.learnedFrom} finished asks)` : ''}.`;

const PolicyForm = ({ policy, onSaved }: { policy: Policy; onSaved: () => void }) => {
  const [p, setP] = useState(policy);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof Policy, v: number | boolean) => setP((x) => ({ ...x, [k]: v }));
  const save = async () => {
    setBusy(true);
    try {
      await call('policy', { policy: p });
      showFlag({ id: 'policy', title: 'Team policy saved', type: 'success', isAutoDismiss: true });
      onSaved();
    } catch (e) {
      showFlag({ id: 'policy-err', title: (e as Error).message, type: 'error', isAutoDismiss: true });
    } finally {
      setBusy(false);
    }
  };
  const perWeek = p.declaredDailyCapacity * 5;
  const askWeek = perWeek * p.askShare;
  const odd = askWeek < 0.5 || askWeek > 40;
  return (
    <form className="policy" onSubmit={(e) => (e.preventDefault(), void save())}>
      <p className={`policy-preview ${odd ? 'policy-odd' : ''}`}>
        With no history, these settings mean about <strong>{Math.round(askWeek * 10) / 10}</strong> asks finished a week
        {askWeek > 0 ? `, so one ask takes roughly ${askWeek >= 1 ? `${Math.max(1, Math.round(5 / askWeek))} working day${Math.round(5 / askWeek) === 1 ? '' : 's'}` : `${Math.round(1 / askWeek)} weeks`}` : ''}.
        {odd && (askWeek < 0.5 ? ' That is very slow. Every ask to this team will look late.' : ' That is unusually fast. Forecasts will look too rosy.')}
      </p>
      <label>
        <span>Promise at</span>
        <input type="number" min={50} max={99} value={Math.round(p.targetConfidence * 100)} onChange={(e) => set('targetConfidence', Number(e.target.value) / 100)} />
        <span className="muted small">% confidence</span>
      </label>
      <label>
        <span>Flag as at risk below</span>
        <input type="number" min={30} max={95} value={Math.round(p.riskThreshold * 100)} onChange={(e) => set('riskThreshold', Number(e.target.value) / 100)} />
        <span className="muted small">%</span>
      </label>
      <label>
        <span>Time spent on other teams' asks</span>
        <span className="muted small">Used until Tether has seen 8 finished asks, then it learns the real share.</span>
        <input type="number" min={5} max={100} value={Math.round(p.askShare * 100)} onChange={(e) => set('askShare', Number(e.target.value) / 100)} />
        <span className="muted small">%</span>
      </label>
      <label>
        <span>Capacity when there is no history</span>
        <input type="number" min={1} max={200} value={Math.round(p.declaredDailyCapacity * 5)} onChange={(e) => set('declaredDailyCapacity', Number(e.target.value) / 5)} />
        <span className="muted small">items a week</span>
      </label>
      <label>
        <span>Accept automatically up to</span>
        <input type="number" min={0} max={10} value={p.autoAcceptMaxSize} onChange={(e) => set('autoAcceptMaxSize', Number(e.target.value))} />
        <span className="muted small">items, when the date is very likely</span>
      </label>
      <label className="check">
        <input type="checkbox" checked={p.autoAcceptGoalAligned} onChange={(e) => set('autoAcceptGoalAligned', e.target.checked)} />
        <span>Only auto-accept asks tied to a goal</span>
      </label>
      <div className="act-buttons">
        <Button type="submit" appearance="primary" isDisabled={busy}>
          Save policy
        </Button>
      </div>
    </form>
  );
};

export const Desk = ({ boot, teamId, onPinned }: { boot: Bootstrap; teamId: string; onPinned?: () => void }) => {
  const { data, error, loading, reload } = useCall<DeskData>('desk', { teamId }, [teamId]);
  const [showPolicy, setShowPolicy] = useState(false);
  const names = new Map(boot.teams.map((t) => [t.id, t.name]));
  const teamName = (id: string) => names.get(id) ?? 'another team';
  useChanges(() => void reload(), (c) => c.teams.includes(teamId));

  if (loading && !data) return <Loading />;
  if (error) return <Problem message={error} onRetry={reload} />;
  if (!data) return null;

  const join = async () => {
    await call('pin', { teamId, on: true });
    showFlag({ id: 'join', title: `You're on ${data.team.name} in Tether`, type: 'success', isAutoDismiss: true });
    onPinned?.();
    void reload();
  };

  const atRisk = data.promised.filter((c) => c.state === 'at_risk' || c.state === 'renegotiating');

  return (
    <div className="desk">
      <header className="desk-head">
        <Team team={data.team} size="medium" />
        <div className="desk-facts">
          <p>{pace(data)}</p>
          <p className="muted small">{honesty(data.calibration)}</p>
        </div>
        <div className="section-actions">
          {!data.member && <Button onClick={join}>I'm on this team</Button>}
          {data.member && (
            <Button appearance="subtle" onClick={() => setShowPolicy((v) => !v)}>
              {showPolicy ? 'Hide policy' : 'Team policy'}
            </Button>
          )}
        </div>
      </header>
      {showPolicy && <PolicyForm policy={data.model.policy} onSaved={() => (setShowPolicy(false), void reload())} />}

      <Section title={`Waiting for your answer${data.inbox.length ? ` (${data.inbox.length})` : ''}`}>
        {data.inbox.length ? (
          <ul className="rows">
            {data.inbox.map((c, i) => (
              <Row key={c.id} card={c} perspective="owner" teamName={teamName} onChanged={reload} open={i === 0} />
            ))}
          </ul>
        ) : (
          <Empty title="No asks waiting">New asks from other teams land here with a forecast and a suggested answer.</Empty>
        )}
      </Section>

      {atRisk.length > 0 && (
        <Section title="Slipping">
          <ul className="rows">
            {atRisk.map((c) => (
              <Row key={c.id} card={c} perspective="owner" teamName={teamName} onChanged={reload} />
            ))}
          </ul>
        </Section>
      )}

      <Section title="What you've promised">
        {data.promised.some((c) => c.state === 'committed') ? (
          <ul className="rows">
            {data.promised
              .filter((c) => c.state === 'committed')
              .map((c) => (
                <Row key={c.id} card={c} perspective="owner" teamName={teamName} onChanged={reload} />
              ))}
          </ul>
        ) : (
          <Empty title={atRisk.length ? 'Everything else is on track' : 'No open promises'} />
        )}
      </Section>

      <Section title="What you're waiting on">
        {data.asked.length ? (
          <ul className="rows">
            {data.asked.map((c) => (
              <Row key={c.id} card={c} perspective="requester" teamName={teamName} onChanged={reload} />
            ))}
          </ul>
        ) : (
          <Empty title="Not waiting on anyone">Raise an ask from any work item with Ask another team.</Empty>
        )}
      </Section>

      {data.closed.length > 0 && (
        <Section title="Recently closed">
          <ul className="rows">
            {data.closed.map((c) => (
              <Row key={c.id} card={c} perspective="owner" teamName={teamName} onChanged={reload} />
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
};
