import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useSearchParams } from 'react-router';
import RichText from '../components/RichText';
import UndoToast from '../components/UndoToast';
import type { Card } from '../db/schema';
import { STATE_LABELS } from '../db/schema';
import {
  browseCards,
  deckNames,
  getReviewsSince,
  isLive,
  restoreCard,
  softDeleteCard,
  toggleStar,
} from '../db/repo';
import { htmlToText } from '../lib/sanitizeHtml';
import { dayStart } from '../lib/stats';

type Filter = 'all' | 'due' | 'new' | 'starred' | 'studied' | 'deleted';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'due', label: 'Due' },
  { key: 'new', label: 'New' },
  { key: 'starred', label: 'Important' },
  { key: 'studied', label: 'Studied today' },
  { key: 'deleted', label: 'Deleted' },
];

const PAGE = 60;

/**
 * Browsing view for the cards behind a deck or a dashboard number. Everything
 * is filtered in memory: even a large collection is a few thousand rows, and
 * the alternative is six different indexed queries that still can't express
 * "studied today".
 */
export default function Cards() {
  const [params, setParams] = useSearchParams();
  const deckId = params.get('deck') ?? '';
  const filter = (FILTERS.find((f) => f.key === params.get('filter'))?.key ?? 'all') as Filter;

  const [search, setSearch] = useState('');
  const [visible, setVisible] = useState(PAGE);
  /** Last card deleted from this list, for the undo toast. */
  const [undo, setUndo] = useState<Card | null>(null);

  const data = useLiveQuery(async () => {
    const [cards, names, todaysReviews] = await Promise.all([
      browseCards(deckId || undefined),
      deckNames(),
      getReviewsSince(dayStart(Date.now())),
    ]);
    return { cards, names, todaysReviews };
  }, [deckId]);

  const query = search.trim().toLowerCase();

  /**
   * Plain-text index so HTML cards match on what you can actually read. Built
   * only while a search is active — it parses every card, which is wasted work
   * on the (usual) unfiltered list.
   */
  const searchable = useMemo(() => {
    const map = new Map<string, string>();
    if (!query) return map;
    for (const c of data?.cards ?? []) {
      const text = c.html ? `${htmlToText(c.front)} ${htmlToText(c.back)}` : `${c.front} ${c.back}`;
      map.set(c.id, `${text} ${c.tags.join(' ')}`.toLowerCase());
    }
    return map;
    // Rebuilt when the cards change or search starts/stops — not per keystroke.
  }, [data?.cards, query.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return null;

  const now = Date.now();
  const { cards, names, todaysReviews } = data;
  const studiedAt = new Map<string, number>();
  for (const r of todaysReviews) {
    studiedAt.set(r.cardId, Math.max(studiedAt.get(r.cardId) ?? 0, r.reviewedAt));
  }

  const matches = (c: Card, f: Filter) => {
    if (f === 'deleted') return !isLive(c);
    if (!isLive(c)) return false;
    if (f === 'due') return c.due <= now;
    if (f === 'new') return c.state === 0;
    if (f === 'starred') return c.starred === 1;
    if (f === 'studied') return studiedAt.has(c.id);
    return true;
  };

  const counts = Object.fromEntries(
    FILTERS.map((f) => [f.key, cards.filter((c) => matches(c, f.key)).length]),
  ) as Record<Filter, number>;

  const rows = cards
    .filter((c) => matches(c, filter))
    .filter((c) => !query || (searchable.get(c.id) ?? '').includes(query))
    .sort((a, b) =>
      filter === 'studied'
        ? (studiedAt.get(b.id) ?? 0) - (studiedAt.get(a.id) ?? 0)
        : a.due - b.due,
    );

  const deckName = deckId ? names.get(deckId) : undefined;

  function setFilter(next: Filter) {
    const p = new URLSearchParams(params);
    if (next === 'all') p.delete('filter');
    else p.set('filter', next);
    setParams(p, { replace: true });
    setVisible(PAGE);
  }

  async function remove(card: Card) {
    await softDeleteCard(card.id);
    setUndo(card);
  }

  async function restore(card: Card) {
    await restoreCard(card.id);
    setUndo(null);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link to="/" className="text-sm text-ink-600 hover:underline dark:text-ink-400">
            ← Decks
          </Link>
          <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight sm:text-3xl">
            {deckName ?? 'All cards'}
          </h1>
        </div>
        {deckId && (
          <Link
            to={`/study/${deckId}`}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
          >
            Study
          </Link>
        )}
      </header>

      <input
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setVisible(PAGE);
        }}
        type="search"
        placeholder="Search cards…"
        className="mb-3 w-full rounded-lg border border-ink-200 bg-white px-3 py-2.5 outline-none focus:border-sky-500 dark:border-ink-800 dark:bg-ink-900"
      />

      {/* Chips scroll sideways rather than wrapping into three rows on a phone. */}
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className={[
              'shrink-0 rounded-full border px-3 py-1.5 text-sm whitespace-nowrap transition',
              filter === f.key
                ? 'border-sky-600 bg-sky-600 text-white'
                : 'border-ink-200 text-ink-600 hover:bg-ink-100 dark:border-ink-800 dark:text-ink-400 dark:hover:bg-ink-900',
            ].join(' ')}
          >
            {f.label}{' '}
            <span className={filter === f.key ? 'text-sky-200' : 'text-ink-400'}>
              {counts[f.key]}
            </span>
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-ink-200 p-6 text-center text-ink-600 dark:border-ink-800 dark:text-ink-400">
          {query ? `Nothing matches “${search.trim()}”.` : 'No cards here.'}
        </p>
      ) : (
        <>
          <ul className="divide-y divide-ink-200 overflow-hidden rounded-xl border border-ink-200 dark:divide-ink-800 dark:border-ink-800">
            {rows.slice(0, visible).map((card) => (
              <CardRow
                key={card.id}
                card={card}
                now={now}
                studiedAt={studiedAt.get(card.id)}
                deckLabel={card.deckId === deckId ? undefined : names.get(card.deckId)}
                onStar={() => void toggleStar(card.id)}
                onDelete={() => void remove(card)}
                onRestore={() => void restore(card)}
              />
            ))}
          </ul>

          {rows.length > visible && (
            <button
              onClick={() => setVisible((v) => v + PAGE)}
              className="mt-3 w-full rounded-lg border border-ink-200 py-2.5 text-sm hover:bg-ink-100 dark:border-ink-800 dark:hover:bg-ink-900"
            >
              Show {Math.min(PAGE, rows.length - visible)} more of {rows.length}
            </button>
          )}
        </>
      )}

      {undo && (
        <UndoToast
          message={`Deleted “${truncate(plain(undo))}”`}
          onUndo={() => void restore(undo)}
          onDismiss={() => setUndo(null)}
        />
      )}
    </div>
  );
}

interface RowProps {
  card: Card;
  now: number;
  studiedAt?: number;
  deckLabel?: string;
  onStar: () => void;
  onDelete: () => void;
  onRestore: () => void;
}

function CardRow({ card, now, studiedAt, deckLabel, onStar, onDelete, onRestore }: RowProps) {
  const [open, setOpen] = useState(false);
  const gone = !isLive(card);

  return (
    <li className={gone ? 'bg-ink-100/60 dark:bg-ink-900/40' : undefined}>
      <div className="flex items-start gap-2 px-3 py-3 sm:px-4">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="min-w-0 flex-1 text-left"
        >
          <RichText
            text={card.front}
            html={card.html}
            className={`font-medium ${open ? '' : 'line-clamp-2'} ${gone ? 'text-ink-400 line-through' : ''}`}
          />
          {open && (
            <div className="mt-2 border-l-2 border-ink-200 pl-3 text-ink-600 dark:border-ink-800 dark:text-ink-400">
              <RichText text={card.back} html={card.html} />
            </div>
          )}
          <p className="mt-1.5 flex flex-wrap gap-x-2 text-xs text-ink-400">
            {deckLabel && <span>{deckLabel}</span>}
            <span>{STATE_LABELS[card.state]}</span>
            <span>
              {studiedAt
                ? `studied ${timeOfDay(studiedAt)}`
                : gone
                  ? 'deleted'
                  : `due ${relative(card.due, now)}`}
            </span>
            {card.tags.length > 0 && <span>{card.tags.join(' · ')}</span>}
          </p>
        </button>

        <div className="flex shrink-0 gap-1">
          {gone ? (
            <button
              onClick={onRestore}
              className="rounded-lg border border-ink-200 px-2.5 py-1.5 text-xs hover:bg-ink-100 dark:border-ink-800 dark:hover:bg-ink-950"
            >
              Restore
            </button>
          ) : (
            <>
              <button
                onClick={onStar}
                aria-pressed={card.starred === 1}
                aria-label={card.starred === 1 ? 'Unmark as important' : 'Mark as important'}
                className={`rounded-lg px-2 py-1.5 text-base ${
                  card.starred === 1 ? 'text-amber-500' : 'text-ink-400 hover:text-ink-600'
                }`}
              >
                {card.starred === 1 ? '★' : '☆'}
              </button>
              <button
                onClick={onDelete}
                aria-label="Delete card"
                className="rounded-lg px-2 py-1.5 text-sm text-ink-400 hover:text-rose-600"
              >
                🗑
              </button>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

function plain(card: Card): string {
  return card.html ? htmlToText(card.front) : card.front;
}

function truncate(s: string, max = 40): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function timeOfDay(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function relative(due: number, now: number): string {
  const ms = due - now;
  if (ms <= 0) return 'now';
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.round(hours / 24);
  return `in ${days}d`;
}
