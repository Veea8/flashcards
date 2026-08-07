import type { Rating } from '../db/schema';

interface Props {
  intervals: Record<Rating, string>;
  onRate: (rating: Rating) => void;
}

const BUTTONS: { rating: Rating; label: string; key: string; className: string }[] = [
  {
    rating: 1,
    label: 'Again',
    key: '1',
    className: 'border-rose-300 hover:bg-rose-50 dark:border-rose-900 dark:hover:bg-rose-950/50',
  },
  {
    rating: 2,
    label: 'Hard',
    key: '2',
    className:
      'border-amber-300 hover:bg-amber-50 dark:border-amber-900 dark:hover:bg-amber-950/50',
  },
  {
    rating: 3,
    label: 'Good',
    key: '3',
    className:
      'border-emerald-300 hover:bg-emerald-50 dark:border-emerald-900 dark:hover:bg-emerald-950/50',
  },
  {
    rating: 4,
    label: 'Easy',
    key: '4',
    className: 'border-sky-300 hover:bg-sky-50 dark:border-sky-900 dark:hover:bg-sky-950/50',
  },
];

export default function RatingBar({ intervals, onRate }: Props) {
  return (
    <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
      {BUTTONS.map((b) => (
        <button
          key={b.rating}
          onClick={() => onRate(b.rating)}
          className={`rounded-xl border-2 px-1 py-3 transition sm:px-3 ${b.className}`}
        >
          <span className="block text-sm font-medium sm:text-base">{b.label}</span>
          <span className="mt-0.5 block text-xs text-ink-600 dark:text-ink-400">
            {intervals[b.rating]}
          </span>
          <span className="keyboard-only mt-1 block text-[10px] text-ink-400">{b.key}</span>
        </button>
      ))}
    </div>
  );
}
