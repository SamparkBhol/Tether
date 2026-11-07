import { useMemo } from 'react';
import { pct, tone } from '../format';
import type { TeamLite } from '../types';

export interface Edge {
  id: string;
  from: string;
  to: string;
  state: string;
  confidence: number | null;
}

interface Props {
  nodes: TeamLite[];
  edges: Edge[];
  selected?: string | null;
  onSelect: (id: string) => void;
}

const W = 720;
const H = 380;

export const TeamMap = ({ nodes, edges, selected, onSelect }: Props) => {
  const layout = useMemo(() => {
    const degree = new Map<string, number>();
    for (const e of edges) {
      degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
      degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
    }
    const sorted = [...nodes].sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0));
    const r = Math.min(W, H) / 2 - 56;
    const pos = new Map(
      sorted.map((n, i) => {
        const a = (i / Math.max(1, sorted.length)) * Math.PI * 2 - Math.PI / 2;
        return [n.id, { x: W / 2 + Math.cos(a) * r * 1.45, y: H / 2 + Math.sin(a) * r }];
      }),
    );
    return { pos, degree };
  }, [nodes, edges]);

  if (!nodes.length) return null;

  return (
    <svg className="teammap" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Which teams owe work to which">
      <defs>
        <marker id="tm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" className="tm-arrowhead" />
        </marker>
      </defs>
      {edges.map((e, i) => {
        const a = layout.pos.get(e.from);
        const b = layout.pos.get(e.to);
        if (!a || !b) return null;
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const bend = 0.18 + (i % 3) * 0.06;
        const cx = mx - dy * bend;
        const cy = my + dx * bend;
        const dim = selected && e.from !== selected && e.to !== selected;
        return (
          <path
            key={e.id}
            d={`M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`}
            className={`tm-edge tm-${tone(e.confidence)} ${e.state === 'proposed' || e.state === 'countered' ? 'tm-pending' : ''} ${dim ? 'tm-dim' : ''}`}
            markerEnd="url(#tm-arrow)"
          >
            <title>{`${pct(e.confidence)} likely`}</title>
          </path>
        );
      })}
      {nodes.map((n) => {
        const p = layout.pos.get(n.id)!;
        const deg = layout.degree.get(n.id) ?? 0;
        return (
          <g
            key={n.id}
            className={`tm-node ${selected === n.id ? 'tm-selected' : ''}`}
            transform={`translate(${p.x}, ${p.y})`}
            tabIndex={0}
            role="button"
            aria-label={`${n.name}, ${deg} open commitments`}
            onClick={() => onSelect(n.id)}
            onKeyDown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && onSelect(n.id)}
          >
            <circle r={10 + Math.min(10, deg * 2)} />
            <text y={30 + Math.min(10, deg * 2)} textAnchor="middle">
              {n.name.length > 22 ? n.name.slice(0, 21) + '…' : n.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
};
