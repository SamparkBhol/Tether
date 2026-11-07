import { optionDetail, optionTitle, pct, tone } from '../format';
import type { Negotiation, Option } from '../types';

interface Props {
  negotiation: Negotiation;
  selected?: Option | null;
  onSelect?: (o: Option) => void;
  teamName: (id: string) => string;
}

const keyOf = (o: Option) => `${o.kind}:${o.dueDate}:${o.size}`;

export const Options = ({ negotiation, selected, onSelect, teamName }: Props) => (
  <ul className="options" role={onSelect ? 'radiogroup' : undefined}>
    {negotiation.options.map((o) => {
      const recommended = keyOf(o) === keyOf(negotiation.recommended);
      const isSelected = selected ? keyOf(selected) === keyOf(o) : false;
      const detail = optionDetail(o, teamName);
      return (
        <li key={keyOf(o)}>
          <button
            className={`option ${isSelected ? 'option-selected' : ''}`}
            role={onSelect ? 'radio' : undefined}
            aria-checked={onSelect ? isSelected : undefined}
            disabled={!onSelect}
            onClick={() => onSelect?.(o)}
          >
            <span className="option-main">
              <span className="option-title">
                {optionTitle(o, negotiation.neededBy)}
                {recommended && <span className="option-pick">Suggested</span>}
              </span>
              {detail && <span className="option-detail">{detail}</span>}
            </span>
            <span className={`option-odds odds-${tone(o.confidence)}`}>{pct(o.confidence)}</span>
          </button>
        </li>
      );
    })}
  </ul>
);

export const verdictLine = (n: Negotiation, owner: string) => {
  const asked = n.options[0];
  switch (n.verdict) {
    case 'easy':
      return `${owner} can very likely do this by the date you need (${pct(asked.confidence)}).`;
    case 'tight':
      return `It's tight. ${owner} hits your date ${pct(asked.confidence)} of the time.`;
    case 'needs_tradeoff':
      return `Your date is ${pct(asked.confidence)} likely as asked, but there's a trade-off that gets you there.`;
    case 'later':
      return `Your date is ${pct(asked.confidence)} likely. A slightly later date is a safe bet.`;
    case 'not_this_quarter':
      return `${owner} is full for a while. Your date is ${pct(asked.confidence)} likely.`;
  }
};
