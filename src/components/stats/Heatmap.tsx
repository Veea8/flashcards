import { useState } from 'react';
import type { DayCount } from '../../lib/stats';
import type { VizPalette } from '../../lib/vizColors';
import ChartTooltip, { type TooltipState } from './ChartTooltip';

const CELL = 11;
const GAP = 3;
const LABEL_W = 22;

/**
 * One square per study day, shaded by review count — the "don't break the
 * chain" view. Single-hue sequential ramp; the lightest step means zero.
 */
export default function Heatmap({ data, p }: { data: DayCount[]; p: VizPalette }) {
  const [tip, setTip] = useState<TooltipState | null>(null);

  const max = Math.max(1, ...data.map((d) => d.total));
  // Pad the start so the first column begins on a Sunday.
  const leading = data.length ? new Date(`${data[0].day}T12:00:00`).getDay() : 0;
  const cells: (DayCount | null)[] = [...Array(leading).fill(null), ...data];
  const weeks = Math.ceil(cells.length / 7);

  const width = LABEL_W + weeks * (CELL + GAP);
  const height = 7 * (CELL + GAP);

  function level(total: number): string {
    if (total === 0) return p.heat[0];
    const ratio = total / max;
    if (ratio <= 0.25) return p.heat[1];
    if (ratio <= 0.5) return p.heat[2];
    if (ratio <= 0.75) return p.heat[3];
    return p.heat[4];
  }

  return (
    <div className="relative overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        role="img"
        aria-label="Review activity by day"
        className="max-w-full"
      >
        {['M', 'W', 'F'].map((label, i) => (
          <text
            key={label}
            x={0}
            y={(i * 2 + 1) * (CELL + GAP) + CELL - 1}
            fontSize={9}
            fill={p.muted}
          >
            {label}
          </text>
        ))}

        {cells.map((cell, i) => {
          if (!cell) return null;
          const col = Math.floor(i / 7);
          const row = i % 7;
          return (
            <rect
              key={cell.day}
              x={LABEL_W + col * (CELL + GAP)}
              y={row * (CELL + GAP)}
              width={CELL}
              height={CELL}
              rx={2}
              fill={level(cell.total)}
              onMouseEnter={() =>
                setTip({
                  x: ((LABEL_W + col * (CELL + GAP) + CELL / 2) / width) * 100,
                  y: ((row * (CELL + GAP)) / height) * 100,
                  content: (
                    <span>
                      <strong>{cell.total}</strong> review{cell.total === 1 ? '' : 's'} ·{' '}
                      {new Date(`${cell.day}T12:00:00`).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  ),
                })
              }
              onMouseLeave={() => setTip(null)}
            />
          );
        })}
      </svg>

      <div className="mt-2 flex items-center gap-1.5 text-xs text-ink-400">
        <span>less</span>
        {p.heat.map((c) => (
          <span key={c} className="inline-block size-2.5 rounded-[2px]" style={{ background: c }} />
        ))}
        <span>more</span>
      </div>

      <ChartTooltip tip={tip} />
    </div>
  );
}
