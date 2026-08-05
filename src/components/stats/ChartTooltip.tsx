import type { ReactNode } from 'react';

export interface TooltipState {
  x: number;
  y: number;
  content: ReactNode;
}

/** Positioned inside a `relative` wrapper; follows the hovered mark. */
export default function ChartTooltip({ tip }: { tip: TooltipState | null }) {
  if (!tip) return null;
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-ink-200 bg-surface px-3 py-2 text-xs whitespace-nowrap shadow-md dark:border-ink-800 dark:bg-ink-900"
      style={{ left: `${tip.x}%`, top: `${tip.y}%` }}
    >
      {tip.content}
    </div>
  );
}
