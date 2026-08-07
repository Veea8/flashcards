import type { CardState } from '../../db/schema';
import type { StateMix } from '../../lib/stats';
import type { VizPalette } from '../../lib/vizColors';

const SIZE = 160;
const R_OUTER = 76;
const R_INNER = 52;
/** Angular padding that produces the 2px surface gap between segments. */
const GAP_DEG = 1.6;

const ORDER: { state: CardState; label: string }[] = [
  { state: 0, label: 'New' },
  { state: 1, label: 'Learning' },
  { state: 2, label: 'Review' },
  { state: 3, label: 'Relearning' },
];

function arc(cx: number, cy: number, from: number, to: number): string {
  const pt = (deg: number, r: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  };
  const large = to - from > 180 ? 1 : 0;
  const [x1, y1] = pt(from, R_OUTER);
  const [x2, y2] = pt(to, R_OUTER);
  const [x3, y3] = pt(to, R_INNER);
  const [x4, y4] = pt(from, R_INNER);
  return [
    `M ${x1} ${y1}`,
    `A ${R_OUTER} ${R_OUTER} 0 ${large} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${R_INNER} ${R_INNER} 0 ${large} 0 ${x4} ${y4}`,
    'Z',
  ].join(' ');
}

export default function StateDonut({ mix, p }: { mix: StateMix; p: VizPalette }) {
  const total = ORDER.reduce((sum, o) => sum + mix[o.state], 0);
  const cx = SIZE / 2;
  const cy = SIZE / 2;

  let cursor = 0;
  const segments = ORDER.map((o, i) => {
    const value = mix[o.state];
    const sweep = total > 0 ? (value / total) * 360 : 0;
    const from = cursor;
    cursor += sweep;
    // Only inset for the gap when there is a neighbouring segment to separate.
    const inset = value > 0 && total > value ? GAP_DEG / 2 : 0;
    return {
      ...o,
      value,
      color: p.states[i],
      d: sweep > 0 ? arc(cx, cy, from + inset, from + sweep - inset) : null,
    };
  });

  return (
    <div className="flex flex-wrap items-center justify-center gap-4 sm:justify-start sm:gap-6">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        width={SIZE}
        height={SIZE}
        role="img"
        aria-label="Cards by scheduling state"
        className="shrink-0"
      >
        {total === 0 ? (
          <circle cx={cx} cy={cy} r={(R_OUTER + R_INNER) / 2} fill="none" stroke={p.grid} strokeWidth={R_OUTER - R_INNER} />
        ) : (
          segments.map((s) => s.d && <path key={s.label} d={s.d} fill={s.color} />)
        )}
        <text
          x={cx}
          y={cy - 2}
          textAnchor="middle"
          fontSize={26}
          fontWeight={600}
          fill="currentColor"
        >
          {total}
        </text>
        <text x={cx} y={cy + 16} textAnchor="middle" fontSize={11} fill={p.muted}>
          cards
        </text>
      </svg>

      {/* Legend doubles as the table view — required relief for the two light
          slots that sit below 3:1 on the light surface. */}
      <ul className="min-w-40 flex-1 space-y-1.5 text-sm">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block size-2.5 shrink-0 rounded-full"
              style={{ background: s.color }}
            />
            <span className="flex-1 text-ink-600 dark:text-ink-400">{s.label}</span>
            <span className="tabular-nums">{s.value}</span>
            <span className="w-12 text-right tabular-nums text-ink-400">
              {total > 0 ? `${Math.round((s.value / total) * 100)}%` : '—'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
