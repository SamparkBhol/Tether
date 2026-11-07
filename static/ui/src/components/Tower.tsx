import { useState } from 'react';
import { dayLabel, pct, STATE_LABEL } from '../format';
import { gapText, livery, sector, sectorWords } from '../livery';
import type { Card } from '../types';
import { Detail } from './Detail';

const urgency = (c: Card) => {
  if (c.state === 'at_risk' || c.state === 'renegotiating') return 0;
  if (c.state === 'proposed' || c.state === 'countered') return 2;
  return 1;
};

const order = (a: Card, b: Card) =>
  urgency(a) - urgency(b) || (b.delta ?? -99) - (a.delta ?? -99) || a.terms.dueDate.localeCompare(b.terms.dueDate);

interface Props {
  rows: Card[];
  teamName: (id: string) => string;
  onChanged: () => void;
  focus?: string | null;
}

export const Tower = ({ rows, teamName, onChanged, focus }: Props) => {
  const [open, setOpen] = useState<string | null>(null);
  const sorted = [...rows].sort(order);
  return (
    <div className="tower" role="table" aria-label="Every open promise between teams, most at risk first">
      <div className="tower-head" role="row">
        <span role="columnheader" className="t-pos" aria-label="Position" />
        <span role="columnheader">Doing the work</span>
        <span role="columnheader">Promise</span>
        <span role="columnheader">Waiting</span>
        <span role="columnheader" className="t-num">Due</span>
        <span role="columnheader" className="t-num">Gap</span>
        <span role="columnheader" className="t-num">Odds</span>
      </div>
      {sorted.map((c, i) => {
        const s = sector(c.delta);
        const due = c.pendingTerms && (c.state === 'renegotiating' || c.state === 'countered') ? c.pendingTerms.dueDate : c.terms.dueDate;
        const expanded = open === c.id;
        const dim = focus && c.owner?.id !== focus && c.requester?.id !== focus;
        return (
          <div key={c.id} className={`tower-row ${dim ? 't-dim' : ''} ${expanded ? 't-open' : ''}`} role="rowgroup">
            <button className="tower-line" role="row" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : c.id)}>
              <span className="t-pos" role="cell">
                {i + 1}
              </span>
              <span className="t-team" role="cell" style={{ ['--stripe' as string]: livery(c.owner?.id) }}>
                <span className="t-team-name">{c.owner?.name ?? 'Unknown team'}</span>
              </span>
              <span className="t-title" role="cell">
                <span className="t-title-text">{c.title}</span>
                <span className="t-sub">
                  <span className="t-key">{c.ownerIssueKey ?? c.sourceIssueKey}</span>
                  <span className={`t-state t-state-${c.state}`}>{STATE_LABEL[c.state]}</span>
                  {c.waitingDays >= 2 && <span className="t-age">waiting {c.waitingDays} days</span>}
                </span>
                {c.waitsOn.length > 0 && (
                  <span className="t-after">
                    after {c.waitsOn.map((u) => `${u.owner}: ${u.title}`).join(', ')}
                  </span>
                )}
              </span>
              <span className="t-wait" role="cell" style={{ ['--stripe' as string]: livery(c.requester?.id) }}>
                {c.requester?.name ?? teamName('')}
              </span>
              <span className="t-num t-due" role="cell">
                {dayLabel(due)}
              </span>
              <span className="t-num" role="cell">
                <span className={`gap gap-${s}`} title={c.forecastP85 ? `85% likely by ${dayLabel(c.forecastP85)}, ${sectorWords[s]}` : sectorWords[s]}>
                  {gapText(c.delta) || 'n/a'}
                </span>
              </span>
              <span className="t-num t-odds" role="cell">
                {pct(c.confidence)}
              </span>
            </button>
            {expanded && (
              <div className="tower-detail">
                <Detail id={c.id} teamName={teamName} onChanged={onChanged} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
