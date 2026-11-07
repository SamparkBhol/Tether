import { useState } from 'react';
import { dayLabel } from '../format';
import type { Card } from '../types';
import { IssueLink, Odds, StateTag, Team } from './bits';
import { Detail } from './Detail';

interface Props {
  card: Card;
  perspective: 'owner' | 'requester';
  teamName: (id: string) => string;
  onChanged: () => void;
  open?: boolean;
}

export const Row = ({ card, perspective, teamName, onChanged, open = false }: Props) => {
  const [expanded, setExpanded] = useState(open);
  const other = perspective === 'owner' ? card.requester : card.owner;
  const proposing = !!card.pendingTerms && (card.state === 'renegotiating' || card.state === 'countered');
  const due = proposing ? card.pendingTerms!.dueDate : card.terms.dueDate;
  const odds = proposing && card.pendingTerms!.confidence !== undefined ? card.pendingTerms!.confidence : card.confidence;
  return (
    <li className={`row row-${card.state}`}>
      <button className="row-head" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
        <Team team={other} size="small" />
        <span className="row-title">
          <span className="row-name">{card.title}</span>
          <span className="row-meta">
            <IssueLink k={perspective === 'owner' ? card.ownerIssueKey ?? card.sourceIssueKey : card.sourceIssueKey} />
            <StateTag state={card.state} />
          </span>
        </span>
        <span className="row-when">
          <span className="row-date" title={proposing ? `Was ${dayLabel(card.terms.dueDate)}` : undefined}>
            {proposing && <span className="row-was">{dayLabel(card.terms.dueDate)}</span>}
            {dayLabel(due)}
          </span>
          <Odds p={odds} />
        </span>
      </button>
      {expanded && (
        <div className="row-body">
          <Detail id={card.id} teamName={teamName} onChanged={onChanged} />
        </div>
      )}
    </li>
  );
};
