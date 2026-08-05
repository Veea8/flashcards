import { useState } from 'react';
import type { DayCount } from '../../lib/stats';
import type { VizPalette } from '../../lib/vizColors';
import ChartTooltip, { type TooltipState } from './ChartTooltip';

const W = 720;
const H = 170;
const PAD_BOTTOM = 22;
const PAD_TOP = 10;
const MAX_BAR = 24;
const GAP = 2; // surface gap between stacked segments
const RADIUS = 4;

/**
 * Reviews per day, split recalled (Good/Easy) vs struggled (Again/Hard) —
 * the same split the retention tile uses. The four-way rating breakdown lives
 * in the tooltip rather than in the color encoding.
 */
export default function ReviewsChart({ data, p }: { data: DayCount[]; p: VizPalette }) {
  const [tip, setTip] = useState<TooltipState | null>(null);

  const max = Math.max(1, ...data.map((d) => d.total));
  const plotH = H - PAD_BOTTOM - PAD_TOP;
  const band = W / data.length;
  const barW = Math.min(MAX_BAR, band * 0.7);
  const yOf = (v: number) => PAD_TOP + plotH - (v / max) * plotH;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Reviews per day">
        <line x1={0} x2={W} y1={yOf(0)} y2={yOf(0)} stroke={p.axis} strokeWidth={1} />
        <line x1={0} x2={W} y1={yOf(max)} y2={yOf(max)} stroke={p.grid} strokeWidth={1} />
        <text x={0} y={yOf(max) - 4} fontSize={10} fill={p.muted} className="tabular-nums">
          {max}
        </text>

        {data.map((d, i) => {
          const cx = i * band + band / 2;
          const x = cx - barW / 2;
          const recalled = d.good + d.easy;
          const struggled = d.again + d.hard;

          // Recalled sits on the baseline; struggled stacks above it, so the
          // red mass reads as a cap on top of the day's work.
          const hRecalled = (recalled / max) * plotH;
          const hStruggled = (struggled / max) * plotH;
          const baseY = yOf(0);
          const topOfRecalled = baseY - hRecalled;
          const struggledBottom = topOfRecalled - (struggled > 0 && recalled > 0 ? GAP : 0);

          return (
            <g
              key={d.day}
              onMouseEnter={() =>
                setTip({
                  x: (cx / W) * 100,
                  y: ((yOf(d.total) - 6) / H) * 100,
                  content: <TipBody d={d} />,
                })
              }
              onMouseLeave={() => setTip(null)}
            >
              {recalled > 0 && (
                <rect
                  x={x}
                  y={topOfRecalled}
                  width={barW}
                  height={hRecalled}
                  rx={struggled > 0 ? 0 : RADIUS}
                  fill={p.recalled}
                />
              )}
              {struggled > 0 && (
                <rect
                  x={x}
                  y={struggledBottom - hStruggled}
                  width={barW}
                  height={hStruggled}
                  rx={RADIUS}
                  fill={p.struggled}
                />
              )}
              {/* Hit target spans the whole band, not just the bar. */}
              <rect x={i * band} y={0} width={band} height={H} fill="transparent" />
            </g>
          );
        })}
      </svg>

      <div className="mt-1 flex justify-between text-xs text-ink-400">
        <span>{shortDay(data[0]?.day)}</span>
        <span>{shortDay(data[data.length - 1]?.day)}</span>
      </div>

      <ChartTooltip tip={tip} />
    </div>
  );
}

function TipBody({ d }: { d: DayCount }) {
  return (
    <>
      <p className="mb-1 font-medium">{longDay(d.day)}</p>
      {d.total === 0 ? (
        <p className="text-ink-600 dark:text-ink-400">No reviews</p>
      ) : (
        <table className="tabular-nums">
          <tbody>
            {(
              [
                ['Again', d.again],
                ['Hard', d.hard],
                ['Good', d.good],
                ['Easy', d.easy],
                ['Total', d.total],
              ] as const
            ).map(([label, n]) => (
              <tr key={label} className={label === 'Total' ? 'font-medium' : undefined}>
                <td className="pr-3 text-ink-600 dark:text-ink-400">{label}</td>
                <td className="text-right">{n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function shortDay(day?: string): string {
  if (!day) return '';
  return new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function longDay(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}
