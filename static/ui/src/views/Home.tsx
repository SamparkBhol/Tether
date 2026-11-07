import Button from '@atlaskit/button/new';
import { useMemo, useState } from 'react';
import { call, useCall, useChanges } from '../api';
import { Empty, Loading, Problem, Section } from '../components/bits';
import { Row } from '../components/Row';
import { TeamMap, type Edge } from '../components/TeamMap';
import type { Bootstrap, Card, TeamLite } from '../types';
import { Desk } from './Desk';

interface Ledger {
  myTeams: string[];
  teams: TeamLite[];
  nodes: TeamLite[];
  edges: Edge[];
  commitments: Card[];
  stats: { open: number; atRisk: number; pending: number; delivered: number };
}

export const Home = ({ boot, refreshBoot }: { boot: Bootstrap; refreshBoot: () => void }) => {
  const [tab, setTab] = useState<'desk' | 'all'>(boot.myTeams.length ? 'desk' : 'all');
  const [team, setTeam] = useState<string | null>(boot.myTeams[0] ?? null);
  const [focus, setFocus] = useState<string | null>(null);
  const ledger = useCall<Ledger>('ledger', {}, []);
  useChanges(() => void ledger.reload());
  const names = useMemo(() => new Map(boot.teams.map((t) => [t.id, t.name])), [boot.teams]);
  const teamName = (id: string) => names.get(id) ?? 'another team';
  const mine = boot.teams.filter((t) => boot.myTeams.includes(t.id));

  const shown = (ledger.data?.commitments ?? []).filter((c) => !focus || c.owner?.id === focus || c.requester?.id === focus);

  return (
    <div className="home">
      <header className="home-head">
        <nav className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'desk'} onClick={() => setTab('desk')}>
            Your team
          </button>
          <button role="tab" aria-selected={tab === 'all'} onClick={() => setTab('all')}>
            Across teams
          </button>
        </nav>
        <Button appearance="subtle" onClick={() => (void call('bootstrap', { refresh: true }).then(refreshBoot))}>
          Refresh teams
        </Button>
      </header>

      {tab === 'desk' &&
        (team ? (
          <>
            <div className="team-switch">
              {mine.map((t) => (
                <button key={t.id} aria-pressed={t.id === team} onClick={() => setTeam(t.id)}>
                  {t.name}
                </button>
              ))}
              <select
                aria-label="Open another team's desk"
                value={mine.some((t) => t.id === team) ? '' : (team ?? '')}
                onChange={(e) => e.target.value && setTeam(e.target.value)}
              >
                <option value="">Another team…</option>
                {boot.teams
                  .filter((t) => !boot.myTeams.includes(t.id))
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>
            </div>
            <Desk boot={boot} teamId={team} onPinned={refreshBoot} />
          </>
        ) : (
          <Empty title="Which team are you on?">
            <p>Pick your team so Tether can show the asks waiting for you and the promises you've made.</p>
            <ul className="team-choose">
              {boot.teams.slice(0, 30).map((t) => (
                <li key={t.id}>
                  <button
                    onClick={async () => {
                      await call('pin', { teamId: t.id, on: true });
                      setTeam(t.id);
                      refreshBoot();
                    }}
                  >
                    {t.name}
                  </button>
                </li>
              ))}
            </ul>
          </Empty>
        ))}

      {tab === 'all' &&
        (ledger.loading && !ledger.data ? (
          <Loading />
        ) : ledger.error ? (
          <Problem message={ledger.error} onRetry={ledger.reload} />
        ) : ledger.data ? (
          <>
            <p className="stats">
              <strong>{ledger.data.stats.open}</strong> open commitments, <strong>{ledger.data.stats.atRisk}</strong> slipping,{' '}
              <strong>{ledger.data.stats.pending}</strong> waiting for an answer, <strong>{ledger.data.stats.delivered}</strong> delivered.
            </p>
            {ledger.data.edges.length > 0 ? (
              <Section title="Who owes whom" aside={focus && <button className="link" onClick={() => setFocus(null)}>Show all teams</button>}>
                <TeamMap nodes={ledger.data.nodes} edges={ledger.data.edges} selected={focus} onSelect={(id) => setFocus((f) => (f === id ? null : id))} />
                <p className="muted small">Arrows point from the team doing the work to the team waiting on it. Dashed means not agreed yet.</p>
              </Section>
            ) : null}
            <Section title={focus ? `Involving ${teamName(focus)}` : 'All commitments'}>
              {shown.length ? (
                <ul className="rows">
                  {shown.map((c) => (
                    <Row key={c.id} card={c} perspective={c.side ?? 'requester'} teamName={teamName} onChanged={ledger.reload} />
                  ))}
                </ul>
              ) : (
                <Empty title="No commitments yet">Open any work item and use Ask another team to start one.</Empty>
              )}
            </Section>
          </>
        ) : null)}
    </div>
  );
};
