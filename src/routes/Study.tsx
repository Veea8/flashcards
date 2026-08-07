import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import CardActions from '../components/CardActions';
import CardFace from '../components/CardFace';
import RatingBar from '../components/RatingBar';
import UndoToast from '../components/UndoToast';
import type { Card, Deck, Rating } from '../db/schema';
import {
  applyReview,
  getDeck,
  getDueCards,
  getNextDueAt,
  restoreCard,
  softDeleteCard,
  toggleStar,
} from '../db/repo';
import { gradeCard, previewIntervals } from '../lib/scheduler';

/**
 * A card rescheduled within this window is a learning step, so it comes back
 * later in the same sitting instead of ending the session.
 */
const SESSION_HORIZON_MS = 20 * 60 * 1000;

function insertByDue(queue: Card[], card: Card): Card[] {
  const at = queue.findIndex((c) => c.due > card.due);
  const next = [...queue];
  next.splice(at === -1 ? queue.length : at, 0, card);
  return next;
}

export default function Study() {
  const { deckId = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const starredOnly = params.get('starred') === '1';
  const studyAhead = params.get('ahead') === '1';

  const [deck, setDeck] = useState<Deck | null>(null);
  const [queue, setQueue] = useState<Card[] | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [revealedAt, setRevealedAt] = useState<number | null>(null);
  const [reviewed, setReviewed] = useState(0);
  const [deleted, setDeleted] = useState<{ card: Card; index: number } | null>(null);
  const [nextDueAt, setNextDueAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [d, cards] = await Promise.all([
        getDeck(deckId),
        getDueCards(deckId, { starredOnly, studyAhead }),
      ]);
      if (cancelled) return;
      setDeck(d ?? null);
      setQueue(cards);
      setReviewed(0);
    })();
    return () => {
      cancelled = true;
    };
  }, [deckId, starredOnly, studyAhead]);

  const current = queue?.[0] ?? null;

  // When the queue empties, find out when the next card is actually due.
  useEffect(() => {
    if (queue && queue.length === 0) void getNextDueAt(deckId).then(setNextDueAt);
  }, [queue, deckId]);

  const intervals = useMemo(
    () => (current ? previewIntervals(current) : null),
    // Recomputed per card; the fuzz means it must not be recomputed per render.
    [current?.id, current?.due], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const reveal = useCallback(() => {
    if (revealed) return;
    setRevealed(true);
    setRevealedAt(Date.now());
  }, [revealed]);

  const rate = useCallback(
    async (rating: Rating) => {
      if (!current || !revealed) return;
      const now = Date.now();
      const updated = gradeCard(current, rating, now);

      await applyReview(current.id, updated, {
        rating,
        reviewedAt: now,
        state: current.state,
        durationMs: revealedAt ? now - revealedAt : 0,
      });

      setQueue((q) => {
        if (!q) return q;
        const rest = q.slice(1);
        const merged = { ...current, ...updated };
        return merged.due - now < SESSION_HORIZON_MS ? insertByDue(rest, merged) : rest;
      });
      setReviewed((n) => n + 1);
      setRevealed(false);
      setRevealedAt(null);
    },
    [current, revealed, revealedAt],
  );

  const star = useCallback(async () => {
    if (!current) return;
    const next = await toggleStar(current.id);
    setQueue((q) => (q ? [{ ...q[0], starred: next }, ...q.slice(1)] : q));
  }, [current]);

  /** Soft delete, no confirm dialog — the undo toast is the safety net. */
  const remove = useCallback(async () => {
    if (!current) return;
    await softDeleteCard(current.id);
    setQueue((q) => (q ? q.slice(1) : q));
    setDeleted({ card: current, index: 0 });
    setRevealed(false);
    setRevealedAt(null);
  }, [current]);

  const undoDelete = useCallback(async () => {
    if (!deleted) return;
    await restoreCard(deleted.card.id);
    setQueue((q) => {
      if (!q) return q;
      const next = [...q];
      next.splice(deleted.index, 0, deleted.card);
      return next;
    });
    setDeleted(null);
    setRevealed(false);
  }, [deleted]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();

      if (key === 'z' && deleted) {
        e.preventDefault();
        void undoDelete();
        return;
      }
      if (key === 'escape') {
        navigate('/');
        return;
      }
      if (!current) return;

      if (key === 's') {
        e.preventDefault();
        void star();
      } else if (key === 'd') {
        e.preventDefault();
        void remove();
      } else if (key === ' ' || key === 'enter') {
        e.preventDefault();
        if (revealed) void rate(3);
        else reveal();
      } else if (revealed && ['1', '2', '3', '4'].includes(key)) {
        e.preventDefault();
        void rate(Number(key) as Rating);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, revealed, deleted, rate, reveal, star, remove, undoDelete, navigate]);

  if (!queue) return null;

  const remaining = queue.length;
  const total = remaining + reviewed;

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-2xl flex-col px-4 py-5 sm:px-6 sm:py-8">
      <header className="mb-4 flex items-center justify-between gap-3 sm:mb-6">
        <button
          onClick={() => navigate('/')}
          className="min-w-0 truncate text-sm text-ink-600 hover:underline dark:text-ink-400"
        >
          ← {deck?.name ?? 'Decks'}
        </button>
        <span className="shrink-0 text-sm whitespace-nowrap text-ink-600 dark:text-ink-400">
          {remaining} left · {reviewed} done
          {starredOnly && ' · ★'}
        </span>
      </header>

      {total > 0 && (
        <div className="mb-5 h-1 overflow-hidden rounded-full bg-ink-200 sm:mb-8 dark:bg-ink-800">
          <div
            className="h-full bg-sky-500 transition-all"
            style={{ width: `${(reviewed / total) * 100}%` }}
          />
        </div>
      )}

      {current ? (
        <div className="flex flex-1 flex-col gap-4 sm:gap-5">
          <div className="flex items-center justify-between gap-2">
            <CardActions
              starred={current.starred === 1}
              onToggleStar={() => void star()}
              onDelete={() => void remove()}
            />
            {current.state === 0 && (
              <span className="shrink-0 rounded-full bg-ink-100 px-2.5 py-1 text-xs text-ink-600 dark:bg-ink-900 dark:text-ink-400">
                new
              </span>
            )}
          </div>

          <button
            onClick={reveal}
            className="w-full cursor-default text-left"
            aria-label="Reveal answer"
            disabled={revealed}
          >
            <CardFace
              front={current.front}
              back={current.back}
              html={current.html}
              tags={current.tags}
              revealed={revealed}
            />
          </button>

          {/*
           * Pinned to the bottom of the viewport on phones so a long answer can
           * scroll without pushing the buttons out of thumb reach. Static from
           * sm up, where the whole card fits anyway.
           */}
          <div className="sticky bottom-0 -mx-4 mt-auto bg-ink-50 px-4 pt-3 pb-2 sm:static sm:mx-0 sm:bg-transparent sm:px-0 sm:pt-0 sm:pb-0 dark:bg-ink-950 dark:sm:bg-transparent">
            {revealed && intervals ? (
              <RatingBar intervals={intervals} onRate={(r) => void rate(r)} />
            ) : (
              <button
                onClick={reveal}
                className="w-full rounded-xl bg-sky-600 py-3.5 font-medium text-white hover:bg-sky-500"
              >
                Show answer <span className="keyboard-only ml-1 text-sky-200">space</span>
              </button>
            )}

            <p className="keyboard-only pt-4 text-center text-xs text-ink-400">
              space reveal / good · 1–4 rate · S important · D delete · Z undo · esc exit
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <p className="text-xl font-medium sm:text-2xl">
            {reviewed > 0 ? `${reviewed} cards reviewed.` : 'Nothing due right now.'}
          </p>
          <p className="text-ink-600 dark:text-ink-400">
            {nextDueAt
              ? `Next card is due ${formatWhen(nextDueAt)}.`
              : 'This deck has no cards left to schedule.'}
          </p>
          <div className="mt-2 flex w-full max-w-xs flex-col gap-3 sm:w-auto sm:max-w-none sm:flex-row">
            <button
              onClick={() => navigate('/')}
              className="rounded-lg bg-sky-600 px-5 py-3 font-medium text-white hover:bg-sky-500 sm:py-2.5"
            >
              Back to decks
            </button>
            {nextDueAt && (
              <button
                onClick={() => navigate(`/study/${deckId}?ahead=1`, { replace: true })}
                className="rounded-lg border border-ink-200 px-5 py-3 font-medium hover:bg-ink-100 sm:py-2.5 dark:border-ink-800 dark:hover:bg-ink-900"
              >
                Study ahead
              </button>
            )}
            <button
              onClick={() => navigate('/stats')}
              className="rounded-lg border border-ink-200 px-5 py-3 font-medium hover:bg-ink-100 sm:py-2.5 dark:border-ink-800 dark:hover:bg-ink-900"
            >
              See progress
            </button>
          </div>
        </div>
      )}

      {deleted && (
        <UndoToast
          message={`Deleted "${truncate(deleted.card.front)}"`}
          onUndo={() => void undoDelete()}
          onDismiss={() => setDeleted(null)}
        />
      )}
    </div>
  );
}

function truncate(s: string, max = 40): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function formatWhen(at: number): string {
  const ms = at - Date.now();
  if (ms <= 0) return 'now';
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `in ${mins} minute${mins === 1 ? '' : 's'}`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `in ${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.round(hours / 24);
  return `in ${days} day${days === 1 ? '' : 's'}`;
}
