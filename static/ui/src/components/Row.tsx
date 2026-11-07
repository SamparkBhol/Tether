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
  const due = card.pendingTerms && (card.state === 'renegotiating' || card.state === 'countered') ? card.pendingTerms.dueDate : card.terms.dueDate;
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
          <span className="row-date">{dayLabel(due)}</span>
          <Odds p={card.confidence} />
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
