import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { dayLabel, pct, shortDay, toDate } from '../format';
import type { CurvePoint } from '../types';

export interface Bucket {
  date: string;
  share: number;
}

export interface ForecastInputs {
  perDay: number;
  askShare: number;
  itemsAhead: number;
  size: number;
  basis: 'history' | 'declared';
  days: number;
}

interface Props {
  curve: CurvePoint[];
  histogram?: Bucket[];
  inputs?: ForecastInputs;
  neededBy?: string;
  neededConfidence?: number;
  proposal?: string;
  proposalConfidence?: number;
  proposalLabel?: string;
  team?: string;
  windowEnd?: string | null;
  target?: number;
}

const W = 640;
const H = 210;
const PAD = { l: 34, r: 14, t: 30, b: 26 };
const DAY = 86_400_000;

const at = (curve: CurvePoint[], iso: string) => {
  const t = toDate(iso).getTime();
  let p = 0;
  for (const pt of curve) if (toDate(pt.date).getTime() <= t) p = pt.probability;
  return p;
};

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export const Forecast = (p: Props) => {
  const { curve, histogram = [], neededBy, proposal, target = 0.85 } = p;
  const box = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [drawn] = useState(() => reduceMotion());

  const g = useMemo(() => {
    if (!curve.length) return null;
    const stamps = [...curve.map((c) => c.date), ...(neededBy ? [neededBy] : []), ...(proposal ? [proposal] : [])].map((d) => toDate(d).getTime());
    const lo = Math.min(...stamps);
    const hi = Math.max(...stamps);
    const span = Math.max(hi - lo, 14 * DAY);
    const min = lo - span * 0.04;
    const max = hi + span * 0.1;
    const x = (d: string) => PAD.l + ((toDate(d).getTime() - min) / (max - min)) * (W - PAD.l - PAD.r);
    const y = (v: number) => PAD.t + (1 - v) * (H - PAD.t - PAD.b);
    const toDateAt = (px: number) => iso(min + ((px - PAD.l) / (W - PAD.l - PAD.r)) * (max - min));
    let d = `M ${PAD.l} ${y(0)}`;
    let prev = 0;
    for (const c of curve) {
      d += ` L ${x(c.date)} ${y(prev)} L ${x(c.date)} ${y(c.probability)}`;
      prev = c.probability;
    }
    d += ` L ${W - PAD.r} ${y(prev)}`;
    const peak = Math.max(0.0001, ...histogram.map((b) => b.share));
    const barW = Math.max(3, ((7 * DAY) / (max - min)) * (W - PAD.l - PAD.r) - 3);
    const bars = histogram.map((b) => ({ x: x(b.date), w: barW, h: (b.share / peak) * (H - PAD.t - PAD.b) * 0.55, share: b.share, date: b.date }));
    const ticks: string[] = [];
    const step = Math.max(7, Math.round((max - min) / DAY / 5 / 7) * 7) * DAY;
    for (let t = lo; t <= max; t += step) ticks.push(iso(t));
    return { x, y, d, bars, ticks, min, max, toDateAt };
  }, [curve, histogram, neededBy, proposal]);

  if (!g) return <div className="curve-empty">No forecast yet.</div>;

  const neededP = neededBy ? (p.neededConfidence ?? at(curve, neededBy)) : null;
  const propP = proposal ? (p.proposalConfidence ?? at(curve, proposal)) : null;
  const hoverP = hover ? at(curve, hover) : null;

  const move = (e: PointerEvent<SVGSVGElement>) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    const px = ((e.clientX - r.left) / r.width) * W;
    if (px < PAD.l || px > W - PAD.r) return setHover(null);
    setHover(g.toDateAt(px));
  };

  const key = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const base = hover ?? neededBy ?? curve[0].date;
    const next = iso(toDate(base).getTime() + (e.key === 'ArrowRight' ? 1 : -1) * DAY);
    if (toDate(next).getTime() >= g.min && toDate(next).getTime() <= g.max) setHover(next);
  };

  const late = neededBy ? g.x(neededBy) : null;

  return (
    <figure className="fc">
      <svg
        ref={box}
        viewBox={`0 0 ${W} ${H}`}
        className="fc-svg"
        role="img"
        tabIndex={0}
        aria-label={`Chance of delivery by date.${neededBy && neededP !== null ? ` ${pct(neededP)} by ${dayLabel(neededBy)}.` : ''}${
          proposal && propP !== null ? ` ${pct(propP)} by ${dayLabel(proposal)}.` : ''
        } Use left and right arrow keys to read other dates.`}
        onPointerMove={move}
        onPointerLeave={() => setHover(null)}
        onKeyDown={key}
        onBlur={() => setHover(null)}
      >
        {late !== null && <rect className="fc-late" x={late} y={PAD.t} width={W - PAD.r - late} height={H - PAD.t - PAD.b} />}
        {[0.5, target, 1].map((v) => (
          <g key={v}>
            <line className={v === target ? 'fc-target' : 'fc-grid'} x1={PAD.l} x2={W - PAD.r} y1={g.y(v)} y2={g.y(v)} />
            <text className="fc-axis" x={PAD.l - 6} y={g.y(v) + 4} textAnchor="end">
              {Math.round(v * 100)}%
            </text>
          </g>
        ))}
        {g.bars.map((b) => (
          <rect key={b.date} className="fc-bar" x={b.x} y={H - PAD.b - b.h} width={b.w} height={b.h} rx={2}>
            <title>{`${pct(b.share)} of outcomes land the week of ${shortDay(b.date)}`}</title>
          </rect>
        ))}
        <path className={`fc-line ${drawn ? '' : 'fc-draw'}`} d={g.d} pathLength={1} />
        {neededBy && late !== null && (
          <g className="fc-needed">
            <line x1={late} x2={late} y1={PAD.t - 16} y2={H - PAD.b} />
            <text x={late + (late > W * 0.72 ? -6 : 6)} y={PAD.t - 7} textAnchor={late > W * 0.72 ? 'end' : 'start'}>
              Needed {shortDay(neededBy)}
            </text>
          </g>
        )}
        {proposal && propP !== null && (
          <g className="fc-prop">
            <circle cx={g.x(proposal)} cy={g.y(propP)} r={5.5} />
            <text x={g.x(proposal) + (g.x(proposal) > W * 0.7 ? -10 : 10)} y={g.y(propP) + 18} textAnchor={g.x(proposal) > W * 0.7 ? 'end' : 'start'}>
              {p.proposalLabel ? `${p.proposalLabel}, ` : ''}
              {pct(propP)} by {shortDay(proposal)}
            </text>
          </g>
        )}
        {neededBy && neededP !== null && proposal !== neededBy && (
          <circle className="fc-needed-dot" cx={g.x(neededBy)} cy={g.y(neededP)} r={4} />
        )}
        {hover && hoverP !== null && (
          <g className="fc-hover">
            <line x1={g.x(hover)} x2={g.x(hover)} y1={PAD.t} y2={H - PAD.b} />
            <circle cx={g.x(hover)} cy={g.y(hoverP)} r={4} />
            <g transform={`translate(${Math.min(Math.max(g.x(hover), PAD.l + 70), W - PAD.r - 70)}, ${PAD.t - 2})`}>
              <rect x={-70} y={-22} width={140} height={20} rx={4} />
              <text y={-8} textAnchor="middle">
                {pct(hoverP)} by {dayLabel(hover)}
              </text>
            </g>
          </g>
        )}
        {g.ticks.map((t, i) => (
          <text key={t + i} className="fc-axis" x={g.x(t)} y={H - 7} textAnchor="middle">
            {shortDay(t)}
          </text>
        ))}
      </svg>
      {p.inputs && <Receipt inputs={p.inputs} team={p.team} windowEnd={p.windowEnd} />}
    </figure>
  );
};

const Receipt = ({ inputs, team = 'They', windowEnd }: { inputs: ForecastInputs; team?: string; windowEnd?: string | null }) => {
  const perWeek = inputs.perDay * 5;
  const askWeek = perWeek * inputs.askShare;
  const work = inputs.itemsAhead + inputs.size;
  const weeks = askWeek > 0 ? work / askWeek : Infinity;
  const r = (n: number) => (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10);
  const source =
    inputs.basis === 'history'
      ? `${inputs.days} working days of finished work${windowEnd ? ` up to ${dayLabel(windowEnd)}` : ''}`
      : 'the capacity the team set';
  return (
    <div className="fc-receipt">
      <span className="fc-term">
        <b>{r(perWeek)}</b> item{r(perWeek) === 1 ? '' : 's'} a week
        <small>{team}'s pace</small>
      </span>
      <span className="fc-op">×</span>
      <span className="fc-term">
        <b>{Math.round(inputs.askShare * 100)}%</b> on asks
        <small>from other teams</small>
      </span>
      <span className="fc-op">=</span>
      <span className="fc-term">
        <b>{r(askWeek)}</b> ask item{r(askWeek) === 1 ? '' : 's'} a week
      </span>
      <span className="fc-op">for</span>
      <span className="fc-term">
        <b>{work}</b> item{work === 1 ? '' : 's'}
        <small>
          {inputs.itemsAhead} ahead, {inputs.size} yours
        </small>
      </span>
      <span className="fc-op">≈</span>
      <span className="fc-term fc-result">
        <b>{Number.isFinite(weeks) ? r(weeks) : 'no'}</b> week{weeks === 1 ? '' : 's'} on average
      </span>
      <p className="fc-note">
        Tether replays {team}'s real day-to-day variation 2,000 times using {source}. The bars show which week each replay finished in, and the line adds them up into the chance of being done by each date.
      </p>
    </div>
  );
};
