import type { ReactNode } from 'react';

interface Props {
  title: string;
  subtitle?: string;
  legend?: { color: string; label: string; value?: string }[];
  children: ReactNode;
  className?: string;
}

/** Shared chart frame: surface, title, and the always-present legend. */
export default function ChartCard({ title, subtitle, legend, children, className }: Props) {
  return (
    <section
      className={`rounded-xl border border-ink-200 bg-surface p-4 sm:p-5 dark:border-ink-800 dark:bg-ink-900 ${className ?? ''}`}
    >
      <header className="mb-1 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 className="font-medium">{title}</h2>
        {legend && legend.length > 0 && (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-600 dark:text-ink-400">
            {legend.map((l) => (
              <li key={l.label} className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="inline-block size-2.5 rounded-full"
                  style={{ background: l.color }}
                />
                {l.label}
                {l.value != null && (
                  <span className="tabular-nums text-ink-900 dark:text-ink-100">{l.value}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </header>
      {subtitle && <p className="mb-4 text-sm text-ink-400">{subtitle}</p>}
      {children}
    </section>
  );
}
