import Button from '@atlaskit/button/new';
import { useMemo, useState } from 'react';
import { call, useCall, useChanges } from '../api';
import { Empty, Loading, Problem } from '../components/bits';
import { RemoveSample, SampleButton, SampleCard } from '../components/Sample';
import { Tower } from '../components/Tower';
import { livery } from '../livery';
import type { Bootstrap, Card, TeamLite } from '../types';
import { Desk } from './Desk';

interface Ledger {
  myTeams: string[];
  teams: TeamLite[];
  nodes: TeamLite[];
  commitments: Card[];
  stats: { open: number; atRisk: number; pending: number; delivered: number };
}

const LIVE = new Set(['proposed', 'countered', 'committed', 'at_risk', 'renegotiating']);

export const Home = ({ boot, refreshBoot }: { boot: Bootstrap; refreshBoot: () => void }) => {
  const [tab, setTab] = useState<'desk' | 'all'>(boot.myTeams.length ? 'desk' : 'all');
  const [team, setTeam] = useState<string | null>(boot.myTeams[0] ?? null);
  const [focus, setFocus] = useState<string | null>(null);
  const ledger = useCall<Ledger>('ledger', {}, []);
  useChanges(() => void ledger.reload());
  const names = useMemo(() => new Map(boot.teams.map((t) => [t.id, t.name])), [boot.teams]);
  const teamName = (id: string) => names.get(id) ?? 'another team';
  const mine = boot.teams.filter((t) => boot.myTeams.includes(t.id));
  const refresh = () => (refreshBoot(), void ledger.reload());

  const live = (ledger.data?.commitments ?? []).filter((c) => LIVE.has(c.state));
  const done = (ledger.data?.commitments ?? []).filter((c) => !LIVE.has(c.state));
  const involved = (ledger.data?.nodes ?? []).filter((t): t is TeamLite => !!t);

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
        <span className="section-actions">
          {boot.sample ? <RemoveSample onDone={refresh} /> : <SampleButton onDone={refresh} />}
          <Button appearance="subtle" onClick={() => void call('bootstrap', { refresh: true }).then(refreshBoot)}>
            Refresh teams
          </Button>
        </span>
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
            <div className="board-top">
              <p className="board-count">
                <strong>{ledger.data.stats.open + ledger.data.stats.pending}</strong> promises in play
              </p>
              <p className="board-split">
                <span className="split split-risk">{ledger.data.stats.atRisk} slipping</span>
                <span className="split split-wait">{ledger.data.stats.pending} waiting for an answer</span>
                <span className="split split-done">{ledger.data.stats.delivered} delivered</span>
              </p>
            </div>
            {involved.length > 1 && (
              <div className="team-filter" role="group" aria-label="Show one team">
                {involved.map((t) => (
                  <button
                    key={t.id}
                    aria-pressed={focus === t.id}
                    style={{ ['--stripe' as string]: livery(t.id) }}
                    onClick={() => setFocus((f) => (f === t.id ? null : t.id))}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            )}
            {live.length ? (
              <Tower rows={live} teamName={teamName} onChanged={ledger.reload} focus={focus} />
            ) : boot.sample ? (
              <Empty title="No open promises">Open any work item and use Ask another team to start one.</Empty>
            ) : (
              <SampleCard onDone={refresh} />
            )}
            {done.length > 0 && (
              <details className="done">
                <summary>
                  {done.length} closed promise{done.length === 1 ? '' : 's'}
                </summary>
                <Tower rows={done} teamName={teamName} onChanged={ledger.reload} />
              </details>
            )}
            <p className="muted small board-key">
              Gap is how far the date Tether is 85% sure of sits from the promised date. Purple is comfortably early, green on pace, yellow a few days behind and red
              well behind.
            </p>
          </>
        ) : null)}
    </div>
  );
};
