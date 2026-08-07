import type { UpcomingDay } from '../../lib/stats';
import type { VizPalette } from '../../lib/vizColors';
import ChartTooltip from './ChartTooltip';
import { useChartTooltip } from './useChartTooltip';

const W = 720;
const H = 150;
const PAD_TOP = 18;
const PAD_BOTTOM = 22;
const MAX_BAR = 24;

/** Cards falling due per day. Single series, so no legend — the title says it. */
export default function UpcomingChart({ data, p }: { data: UpcomingDay[]; p: VizPalette }) {
  const { tip, markProps, clear } = useChartTooltip();

  const max = Math.max(1, ...data.map((d) => d.count));
  const peak = data.reduce((a, b) => (b.count > a.count ? b : a), data[0]);
  const plotH = H - PAD_TOP - PAD_BOTTOM;
  const band = W / data.length;
  const barW = Math.min(MAX_BAR, band * 0.6);
  const yOf = (v: number) => PAD_TOP + plotH - (v / max) * plotH;

  return (
    <div className="relative" onPointerLeave={clear}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-manipulation"
        role="img"
        aria-label="Cards due per day"
      >
        <line x1={0} x2={W} y1={yOf(0)} y2={yOf(0)} stroke={p.axis} strokeWidth={1} />

        {data.map((d, i) => {
          const cx = i * band + band / 2;
          const h = (d.count / max) * plotH;
          // Label only the peak — a number on every column goes unread.
          const isPeak = peak && d.day === peak.day && d.count > 0;
          return (
            <g
              key={d.day}
              {...markProps(
                (cx / W) * 100,
                ((yOf(d.count) - 6) / H) * 100,
                <span>
                  <strong>{d.count}</strong> card{d.count === 1 ? '' : 's'} ·{' '}
                  {i === 0 ? 'today' : fullLabel(d.day)}
                </span>,
              )}
            >
              {d.count > 0 && (
                <rect x={cx - barW / 2} y={yOf(d.count)} width={barW} height={h} rx={4} fill={p.single} />
              )}
              {isPeak && (
                <text
                  x={cx}
                  y={yOf(d.count) - 5}
                  textAnchor="middle"
                  fontSize={11}
                  fill="currentColor"
                  className="tabular-nums"
                >
                  {d.count}
                </text>
              )}
              <text x={cx} y={H - 6} textAnchor="middle" fontSize={9} fill={p.muted}>
                {i === 0 ? 'today' : label(d.day)}
              </text>
              <rect x={i * band} y={0} width={band} height={H} fill="transparent" />
            </g>
          );
        })}
      </svg>
      <ChartTooltip tip={tip} />
    </div>
  );
}

function label(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'narrow',
  });
}

/** The axis shows a single letter; the tooltip can afford the full date. */
function fullLabel(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}
