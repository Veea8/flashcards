interface Tile {
  label: string;
  value: string;
  hint?: string;
}

export default function StatTiles({ tiles }: { tiles: Tile[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {tiles.map((t) => (
        <div
          key={t.label}
          className="rounded-xl border border-ink-200 bg-surface p-4 dark:border-ink-800 dark:bg-ink-900"
        >
          <p className="text-sm text-ink-600 dark:text-ink-400">{t.label}</p>
          <p className="mt-1 text-3xl font-semibold">{t.value}</p>
          {t.hint && <p className="mt-0.5 text-xs text-ink-400">{t.hint}</p>}
        </div>
      ))}
    </div>
  );
}
