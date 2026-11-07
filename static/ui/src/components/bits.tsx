import Avatar from '@atlaskit/avatar';
import Lozenge from '@atlaskit/lozenge';
import Spinner from '@atlaskit/spinner';
import { router } from '@forge/bridge';
import type { ReactNode } from 'react';
import { STATE_APPEARANCE, STATE_LABEL, oddsWords, pct, tone } from '../format';
import type { State, TeamLite } from '../types';

export const StateTag = ({ state }: { state: State }) => (
  <Lozenge appearance={STATE_APPEARANCE[state]}>{STATE_LABEL[state]}</Lozenge>
);

export const Team = ({ team, size = 'small' }: { team: TeamLite | null; size?: 'xsmall' | 'small' | 'medium' }) => (
  <span className="team">
    <Avatar appearance="square" size={size} src={team?.avatarUrl} name={team?.name ?? 'Unknown team'} />
    <span className="team-name">{team?.name ?? 'Unknown team'}</span>
  </span>
);

export const Odds = ({ p, target, risk, words = false }: { p: number | null | undefined; target?: number; risk?: number; words?: boolean }) => (
  <span className={`odds odds-${tone(p, target, risk)}`} title={oddsWords(p)}>
    <span className="odds-bar" aria-hidden="true">
      <span style={{ width: `${Math.round((p ?? 0) * 100)}%` }} />
    </span>
    <span className="odds-num">{pct(p)}</span>
    {words && <span className="odds-words">{oddsWords(p)}</span>}
  </span>
);

export const Loading = ({ label = 'Loading' }: { label?: string }) => (
  <div className="loading" role="status">
    <Spinner size="medium" label={label} />
  </div>
);

export const Problem = ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
  <div className="problem" role="alert">
    <p>{message}</p>
    {onRetry && (
      <button className="link" onClick={onRetry}>
        Try again
      </button>
    )}
  </div>
);

export const Empty = ({ title, children }: { title: string; children?: ReactNode }) => (
  <div className="empty">
    <p className="empty-title">{title}</p>
    {children && <div className="empty-body">{children}</div>}
  </div>
);

export const Section = ({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) => (
  <section className="section">
    <header className="section-head">
      <h2>{title}</h2>
      {aside}
    </header>
    {children}
  </section>
);

export const IssueLink = ({ k }: { k: string | null }) =>
  k ? (
    <button className="issue-key" onClick={() => void router.navigate(`/browse/${k}`)}>
      {k}
    </button>
  ) : null;
