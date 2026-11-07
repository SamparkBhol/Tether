import { useMemo } from 'react';
import { dayLabel, pct, shortDay, toDate } from '../format';
import type { CurvePoint } from '../types';

interface Props {
  points: CurvePoint[];
  neededBy?: string;
  due?: string;
  target?: number;
  height?: number;
  label?: string;
  neededConfidence?: number;
  dueConfidence?: number;
}

const W = 640;
const PAD = { l: 8, r: 8, t: 26, b: 22 };

const probabilityAt = (points: CurvePoint[], iso: string) => {
  const t = toDate(iso).getTime();
  let p = 0;
  for (const pt of points) if (toDate(pt.date).getTime() <= t) p = pt.probability;
  return p;
};

export const Curve = ({ points, neededBy, due, target = 0.85, height = 168, label, neededConfidence, dueConfidence }: Props) => {
  const H = height;
  const geo = useMemo(() => {
    if (!points.length) return null;
    const dates = [...points.map((p) => p.date), ...(neededBy ? [neededBy] : []), ...(due ? [due] : [])].map((d) => toDate(d).getTime());
    const span = Math.max(...dates) - Math.min(...dates);
    const min = Math.min(...dates) - Math.max(86_400_000, span * 0.03);
    const max = Math.max(...dates) + Math.max(2 * 86_400_000, span * 0.12);
    const x = (iso: string) => PAD.l + ((toDate(iso).getTime() - min) / (max - min)) * (W - PAD.l - PAD.r);
    const y = (p: number) => PAD.t + (1 - p) * (H - PAD.t - PAD.b);
    const steps: string[] = [`M ${PAD.l} ${y(0)}`];
    let prev = 0;
    for (const pt of points) {
      steps.push(`L ${x(pt.date)} ${y(prev)}`, `L ${x(pt.date)} ${y(pt.probability)}`);
      prev = pt.probability;
    }
    steps.push(`L ${W - PAD.r} ${y(prev)}`);
    const line = steps.join(' ');
    const area = `${line} L ${W - PAD.r} ${y(0)} L ${PAD.l} ${y(0)} Z`;
    const ticks = [points[0].date, points[Math.floor(points.length / 2)].date, points[points.length - 1].date];
    return { x, y, line, area, ticks };
  }, [points, neededBy, due, H]);

  if (!geo) return <div className="curve-empty">No forecast yet.</div>;
  const neededP = neededBy ? (neededConfidence ?? (due === neededBy ? dueConfidence : undefined) ?? probabilityAt(points, neededBy)) : null;
  const dueP = due ? (due === neededBy && neededConfidence !== undefined ? neededConfidence : (dueConfidence ?? probabilityAt(points, due))) : null;
  const summary =
    label ??
    [
      neededBy && neededP !== null ? `${pct(neededP)} by ${dayLabel(neededBy)}` : null,
      due && dueP !== null && due !== neededBy ? `${pct(dueP)} by ${dayLabel(due)}` : null,
    ]
      .filter(Boolean)
      .join(', ');

  return (
    <figure className="curve">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Chance of delivery by date. ${summary}`} preserveAspectRatio="xMidYMid meet">
        <line className="curve-target" x1={PAD.l} x2={W - PAD.r} y1={geo.y(target)} y2={geo.y(target)} />
        <text className="curve-axis" x={W - PAD.r} y={geo.y(target) - 5} textAnchor="end">
          {pct(target)}
        </text>
        <path className="curve-area" d={geo.area} />
        <path className="curve-line" d={geo.line} />
        {neededBy && (
          <g className="curve-needed">
            <line x1={geo.x(neededBy)} x2={geo.x(neededBy)} y1={PAD.t - 14} y2={H - PAD.b} />
            <text x={geo.x(neededBy) + (geo.x(neededBy) > W * 0.75 ? -6 : 6)} y={PAD.t - 6} textAnchor={geo.x(neededBy) > W * 0.75 ? 'end' : 'start'}>
              Needed {shortDay(neededBy)}
            </text>
          </g>
        )}
        {due && dueP !== null && (
          <g className="curve-due">
            <circle cx={geo.x(due)} cy={geo.y(dueP)} r={5} />
            <text x={geo.x(due) + (geo.x(due) > W * 0.7 ? -9 : 9)} y={geo.y(dueP) + 16} textAnchor={geo.x(due) > W * 0.7 ? 'end' : 'start'}>
              {pct(dueP)} by {shortDay(due)}
            </text>
          </g>
        )}
        {geo.ticks.map((t, i) => (
          <text key={t + i} className="curve-axis" x={geo.x(t)} y={H - 5} textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}>
            {shortDay(t)}
          </text>
        ))}
      </svg>
      {summary && <figcaption>{summary}</figcaption>}
    </figure>
  );
};
