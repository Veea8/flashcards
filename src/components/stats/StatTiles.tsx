import { Link } from 'react-router';

interface Tile {
  label: string;
  value: string;
  hint?: string;
  /** When set, the tile links through to the cards behind the number. */
  to?: string;
}

const BOX = 'rounded-xl border border-ink-200 bg-surface p-3.5 sm:p-4 dark:border-ink-800 dark:bg-ink-900';

export default function StatTiles({ tiles }: { tiles: Tile[] }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5">
      {tiles.map((t) => {
        const body = (
          <>
            <p className="text-sm text-ink-600 dark:text-ink-400">{t.label}</p>
            <p className="mt-1 text-2xl font-semibold sm:text-3xl">{t.value}</p>
            {t.hint && <p className="mt-0.5 truncate text-xs text-ink-400">{t.hint}</p>}
          </>
        );
        return t.to ? (
          <Link
            key={t.label}
            to={t.to}
            className={`${BOX} transition hover:border-sky-400 hover:bg-ink-100 dark:hover:bg-ink-800`}
          >
            {body}
          </Link>
        ) : (
          <div key={t.label} className={BOX}>
            {body}
          </div>
        );
      })}
    </div>
  );
}
