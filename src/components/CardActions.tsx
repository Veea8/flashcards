interface Props {
  starred: boolean;
  onToggleStar: () => void;
  onDelete: () => void;
}

/**
 * Always visible while studying — burying these in a menu is exactly the
 * friction we're trying to avoid.
 */
export default function CardActions({ starred, onToggleStar, onDelete }: Props) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onToggleStar}
        title={starred ? 'Unmark as important (S)' : 'Mark as important (S)'}
        aria-pressed={starred}
        className={[
          'rounded-lg border px-3 py-1.5 text-sm transition',
          starred
            ? 'border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
            : 'border-ink-200 text-ink-600 hover:bg-ink-100 dark:border-ink-800 dark:text-ink-400 dark:hover:bg-ink-900',
        ].join(' ')}
      >
        {starred ? '★' : '☆'} Important
      </button>
      <button
        onClick={onDelete}
        title="Delete this card (D) — undoable"
        className="rounded-lg border border-ink-200 px-3 py-1.5 text-sm text-ink-600 transition hover:border-rose-400 hover:text-rose-600 dark:border-ink-800 dark:text-ink-400"
      >
        🗑 Delete
      </button>
    </div>
  );
}
