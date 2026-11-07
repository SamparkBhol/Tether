import { useState } from 'react';
import { dayLabel } from '../format';
import { gapText, livery, sector, sectorWords } from '../livery';
import type { Card } from '../types';
import { IssueLink, Odds, StateTag, Team } from './bits';
import { Detail } from './Detail';

interface Props {
  card: Card;
  perspective: 'owner' | 'requester';
  teamName: (id: string) => string;
  onChanged: () => void;
  open?: boolean;
  linkTo?: 'work' | 'mine';
}

export const Row = ({ card, perspective, teamName, onChanged, open = false, linkTo = 'mine' }: Props) => {
  const [expanded, setExpanded] = useState(open);
  const other = perspective === 'owner' ? card.requester : card.owner;
  const proposing = !!card.pendingTerms && (card.state === 'renegotiating' || card.state === 'countered');
  const due = proposing ? card.pendingTerms!.dueDate : card.terms.dueDate;
  const closed = ['withdrawn', 'declined', 'delivered', 'broken'].includes(card.state);
  const odds = proposing && card.pendingTerms!.confidence !== undefined ? card.pendingTerms!.confidence : card.confidence;
  return (
    <li className={`row row-${card.state}`} style={{ ['--stripe' as string]: livery(other?.id) }}>
      <button className="row-head" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
        <Team team={other} size="small" />
        <span className="row-title">
          <span className="row-name">{card.title}</span>
          <span className="row-meta">
            <IssueLink k={perspective === 'owner' || linkTo === 'work' ? (card.ownerIssueKey ?? card.sourceIssueKey) : card.sourceIssueKey} />
            <StateTag state={card.state} />
            {card.waitingDays >= 2 && <span className="row-age">waiting {card.waitingDays} days</span>}
          </span>
          {card.waitsOn.length > 0 && <span className="row-after">after {card.waitsOn.map((u) => `${u.owner}: ${u.title}`).join(', ')}</span>}
        </span>
        <span className="row-when">
          <span className="row-date" title={proposing ? `Was ${dayLabel(card.terms.dueDate)}` : undefined}>
            {proposing && <span className="row-was">{dayLabel(card.terms.dueDate)}</span>}
            {dayLabel(due)}
          </span>
          <span className="row-pace">
            {card.delta !== null && !proposing && (
              <span
                className={`gap gap-${sector(card.delta)}`}
                title={card.forecastP85 ? `85% likely by ${dayLabel(card.forecastP85)}, ${sectorWords[sector(card.delta)]}` : undefined}
              >
                {gapText(card.delta)}
              </span>
            )}
            {!closed && <Odds p={odds} />}
          </span>
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
