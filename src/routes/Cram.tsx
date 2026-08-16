import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import CardActions from '../components/CardActions';
import CardFace from '../components/CardFace';
import UndoToast from '../components/UndoToast';
import type { Card, Deck } from '../db/schema';
import {
  clearCramSession,
  completeCramSession,
  getCramSession,
  getDeck,
  getDueCards,
  logCramAnswer,
  restoreCard,
  saveCramSession,
  softDeleteCard,
  toggleStar,
} from '../db/repo';
import {
  answer,
  isFinished,
  makeBatches,
  recapOf,
  restoreSession,
  shuffle,
  snapshotOf,
  startBatch,
  type CramItem,
  type CramProgress,
  type CramRecap,
  BATCH_SIZE,
} from '../lib/cram';

/**
 * Exam-week drilling. Ignores due dates entirely, walks the deck in batches of
 * six, and only unlocks the next six once every card in the current one has
 * been answered correctly. Nothing here touches FSRS scheduling — see
 * logCramAnswer.
 */
export default function Cram() {
  const { deckId = '' } = useParams();
  const navigate = useNavigate();

  const [deck, setDeck] = useState<Deck | null>(null);
  const [batches, setBatches] = useState<Card[][] | null>(null);
  const [batchIndex, setBatchIndex] = useState(0);
  const [queue, setQueue] = useState<CramItem[]>([]);
  /** Set between batches: the checkpoint, not a card. */
  const [resting, setResting] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [revealedAt, setRevealedAt] = useState<number | null>(null);
  const [missed, setMissed] = useState<Card[]>([]);
  const [answered, setAnswered] = useState(0);
  const [deleted, setDeleted] = useState<Card | null>(null);
  /** Every card in the deck, so "go again" can reshuffle from the recap screen. */
  const [allCards, setAllCards] = useState<Card[]>([]);
  /** Set instead of a run when you've just finished this deck. */
  const [recap, setRecap] = useState<CramRecap | null>(null);

  const apply = useCallback((p: CramProgress) => {
    setRecap(null);
    setBatches(p.batches);
    setBatchIndex(p.batchIndex);
    setQueue(p.queue);
    setResting(p.resting);
    setMissed(p.missed);
    setAnswered(p.answered);
    setRevealed(false);
    setRevealedAt(null);
  }, []);

  /** Starts a fresh run over the given cards, discarding any saved progress. */
  const load = useCallback(
    (cards: Card[]) => {
      const groups = makeBatches(shuffle(cards));
      apply({
        batches: groups,
        batchIndex: 0,
        queue: groups.length ? startBatch(groups[0]) : [],
        resting: false,
        missed: [],
        answered: 0,
      });
    },
    [apply],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // studyAhead ignores due dates, which is exactly the cram selection.
      const [d, cards, saved] = await Promise.all([
        getDeck(deckId),
        getDueCards(deckId, { studyAhead: true }),
        getCramSession(deckId),
      ]);
      if (cancelled) return;
      setDeck(d ?? null);
      setAllCards(cards);
      // Pick up an unfinished run rather than re-drilling the sets you cleared;
      // if the last one is finished, say so instead of silently reshuffling.
      const resumed = saved ? restoreSession(saved, cards) : null;
      if (resumed) apply(resumed);
      else {
        const done = saved ? recapOf(saved, cards) : null;
        if (done) setRecap(done);
        else load(cards);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [deckId, apply, load]);

  /**
   * One write per answer keeps the run recoverable if the tab closes. Finishing
   * marks the run done rather than deleting it — on a two-set deck, deleting
   * would reset you to zero the instant you completed it.
   */
  useEffect(() => {
    if (!batches || !deckId) return;
    const progress: CramProgress = { batches, batchIndex, queue, resting, missed, answered };
    const snapshot = snapshotOf(deckId, progress);
    if (!isFinished(progress)) void saveCramSession(snapshot);
    else if (batches.length === 0) void clearCramSession(deckId); // empty deck: nothing to record
    else void completeCramSession(snapshot);
  }, [deckId, batches, batchIndex, queue, resting, missed, answered]);

  const current = queue[0]?.card ?? null;
  const totalCards = useMemo(
    () => (batches ?? []).reduce((sum, b) => sum + b.length, 0),
    [batches],
  );

  const reveal = useCallback(() => {
    if (revealed) return;
    setRevealed(true);
    setRevealedAt(Date.now());
  }, [revealed]);

  const respond = useCallback(
    async (correct: boolean) => {
      if (!current || !revealed) return;
      await logCramAnswer(current, correct, revealedAt ? Date.now() - revealedAt : 0);

      const next = answer(queue, correct);
      setQueue(next);
      setAnswered((n) => n + 1);
      if (!correct) {
        setMissed((m) => (m.some((c) => c.id === current.id) ? m : [...m, current]));
      }
      // An empty queue means the batch is clean — pause rather than roll on.
      if (next.length === 0) setResting(true);
      setRevealed(false);
      setRevealedAt(null);
    },
    [current, queue, revealed, revealedAt],
  );

  const nextBatch = useCallback(() => {
    if (!batches) return;
    const index = batchIndex + 1;
    setBatchIndex(index);
    setQueue(index < batches.length ? startBatch(batches[index]) : []);
    setResting(false);
    setRevealed(false);
  }, [batches, batchIndex]);

  const star = useCallback(async () => {
    if (!current) return;
    const next = await toggleStar(current.id);
    setQueue((q) => [{ ...q[0], card: { ...q[0].card, starred: next } }, ...q.slice(1)]);
  }, [current]);

  const remove = useCallback(async () => {
    if (!current) return;
    await softDeleteCard(current.id);
    const rest = queue.slice(1);
    setQueue(rest);
    setDeleted(current);
    if (rest.length === 0) setResting(true);
    setRevealed(false);
  }, [current, queue]);

  const undoDelete = useCallback(async () => {
    if (!deleted) return;
    await restoreCard(deleted.id);
    setQueue((q) => [{ card: deleted, remaining: 1, missed: false }, ...q]);
    setResting(false);
    setDeleted(null);
    setRevealed(false);
  }, [deleted]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();

      if (key === 'escape') {
        navigate('/');
        return;
      }
      if (key === 'z' && deleted) {
        e.preventDefault();
        void undoDelete();
        return;
      }
      if (resting) {
        if (key === ' ' || key === 'enter') {
          e.preventDefault();
          nextBatch();
        }
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
        if (revealed) void respond(true);
        else reveal();
      } else if (revealed && (key === '1' || key === '2')) {
        e.preventDefault();
        void respond(key === '2');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    current,
    revealed,
    resting,
    deleted,
    respond,
    reveal,
    star,
    remove,
    undoDelete,
    nextBatch,
    navigate,
  ]);

  // A finished run gets a recap rather than an immediate reshuffle, so coming
  // back doesn't look like the drill you just did was thrown away.
  if (recap) {
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
            Cram · done
          </span>
        </header>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <p className="text-xl font-medium sm:text-2xl">
            You finished this deck {finishedLabel(recap.completedAt)}.
          </p>
          <p className="text-ink-600 dark:text-ink-400">
            {recap.total} card{recap.total === 1 ? '' : 's'} drilled clean · {recap.answered} answer
            {recap.answered === 1 ? '' : 's'}
            {recap.missed.length > 0 &&
              ` · ${recap.missed.length} you missed at least once`}
          </p>
          <div className="mt-2 flex w-full max-w-xs flex-col gap-3 sm:w-auto sm:max-w-none sm:flex-row">
            {recap.missed.length > 0 && (
              <button
                onClick={() => load(recap.missed)}
                className="rounded-lg bg-violet-600 px-5 py-3 font-medium text-white hover:bg-violet-500 sm:py-2.5"
              >
                Redo the {recap.missed.length} I missed
              </button>
            )}
            <button
              onClick={() => load(allCards)}
              className="rounded-lg border border-ink-200 px-5 py-3 font-medium hover:bg-ink-100 sm:py-2.5 dark:border-ink-800 dark:hover:bg-ink-900"
            >
              Drill it again
            </button>
            <button
              onClick={() => navigate('/')}
              className="rounded-lg border border-ink-200 px-5 py-3 font-medium hover:bg-ink-100 sm:py-2.5 dark:border-ink-800 dark:hover:bg-ink-900"
            >
              Back to decks
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!batches) return null;

  const finished = batchIndex >= batches.length || (resting && batchIndex === batches.length - 1);
  const batchSize = batches[batchIndex]?.length ?? 0;
  const cleared = batchSize - new Set(queue.map((i) => i.card.id)).size;

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
          Cram · set {Math.min(batchIndex + 1, batches.length)} of {batches.length}
        </span>
      </header>

      {!finished && (
        <div className="mb-5 h-1 overflow-hidden rounded-full bg-ink-200 sm:mb-8 dark:bg-ink-800">
          <div
            className="h-full bg-violet-500 transition-all"
            style={{ width: `${batchSize ? (cleared / batchSize) * 100 : 0}%` }}
          />
        </div>
      )}

      {finished ? (
        <Summary
          total={totalCards}
          answered={answered}
          missed={missed}
          onRedoMissed={() => load(missed)}
          onRestart={() => load(batches.flat())}
          onLeave={() => navigate('/')}
        />
      ) : resting ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <p className="text-xl font-medium sm:text-2xl">
            Set {batchIndex + 1} clean — all {batchSize} of them.
          </p>
          <p className="text-ink-600 dark:text-ink-400">
            {batches.length - batchIndex - 1} set
            {batches.length - batchIndex - 1 === 1 ? '' : 's'} left in this deck.
          </p>
          <button
            onClick={nextBatch}
            className="mt-2 w-full max-w-xs rounded-xl bg-violet-600 py-3.5 font-medium text-white hover:bg-violet-500 sm:w-auto sm:px-8"
          >
            Next {Math.min(BATCH_SIZE, batches[batchIndex + 1]?.length ?? 0)} cards
            <span className="keyboard-only ml-1 text-violet-200">space</span>
          </button>
          {/* Leaving is safe: the sets you cleared are saved, and coming back
              picks up right here. */}
          <div className="flex gap-4 text-sm text-ink-600 dark:text-ink-400">
            <button onClick={() => navigate('/')} className="hover:underline">
              Stop here — progress is saved
            </button>
            <button onClick={() => load(batches.flat())} className="hover:underline">
              Start over
            </button>
          </div>
        </div>
      ) : current ? (
        <div className="flex flex-1 flex-col gap-4 sm:gap-5">
          <div className="flex items-center justify-between gap-2">
            <CardActions
              starred={current.starred === 1}
              onToggleStar={() => void star()}
              onDelete={() => void remove()}
            />
            <span className="shrink-0 text-xs text-ink-600 dark:text-ink-400">
              {queue.length} to clear
            </span>
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

          <div className="sticky bottom-0 -mx-4 mt-auto bg-ink-50 px-4 pt-3 pb-2 sm:static sm:mx-0 sm:bg-transparent sm:px-0 sm:pt-0 sm:pb-0 dark:bg-ink-950 dark:sm:bg-transparent">
            {revealed ? (
              // Two buttons, not four: cramming asks "did I know it", and a
              // wrong answer here means "show me again", not a difficulty.
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => void respond(false)}
                  className="rounded-xl border border-ink-200 py-3.5 font-medium hover:border-rose-400 hover:text-rose-600 dark:border-ink-800"
                >
                  Missed it<span className="keyboard-only ml-1 text-ink-400">1</span>
                </button>
                <button
                  onClick={() => void respond(true)}
                  className="rounded-xl bg-violet-600 py-3.5 font-medium text-white hover:bg-violet-500"
                >
                  Got it<span className="keyboard-only ml-1 text-violet-200">2</span>
                </button>
              </div>
            ) : (
              <button
                onClick={reveal}
                className="w-full rounded-xl bg-violet-600 py-3.5 font-medium text-white hover:bg-violet-500"
              >
                Show answer <span className="keyboard-only ml-1 text-violet-200">space</span>
              </button>
            )}

            <p className="keyboard-only pt-4 text-center text-xs text-ink-400">
              space reveal / got it · 1 missed · 2 got it · S important · D delete · esc exit
            </p>
          </div>
        </div>
      ) : null}

      {deleted && (
        <UndoToast
          message={`Deleted "${truncate(deleted.front)}"`}
          onUndo={() => void undoDelete()}
          onDismiss={() => setDeleted(null)}
        />
      )}
    </div>
  );
}

interface SummaryProps {
  total: number;
  answered: number;
  missed: Card[];
  onRedoMissed: () => void;
  onRestart: () => void;
  onLeave: () => void;
}

function Summary({ total, answered, missed, onRedoMissed, onRestart, onLeave }: SummaryProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <p className="text-xl font-medium sm:text-2xl">
        {total === 0 ? 'Nothing to cram — this deck is empty.' : `${total} cards drilled clean.`}
      </p>
      <p className="text-ink-600 dark:text-ink-400">
        {answered} answer{answered === 1 ? '' : 's'} ·{' '}
        {missed.length === 0
          ? 'nothing missed'
          : `${missed.length} card${missed.length === 1 ? '' : 's'} you missed at least once`}
      </p>
      <div className="mt-2 flex w-full max-w-xs flex-col gap-3 sm:w-auto sm:max-w-none sm:flex-row">
        {missed.length > 0 && (
          <button
            onClick={onRedoMissed}
            className="rounded-lg bg-violet-600 px-5 py-3 font-medium text-white hover:bg-violet-500 sm:py-2.5"
          >
            Redo the {missed.length} I missed
          </button>
        )}
        <button
          onClick={onRestart}
          className="rounded-lg border border-ink-200 px-5 py-3 font-medium hover:bg-ink-100 sm:py-2.5 dark:border-ink-800 dark:hover:bg-ink-900"
        >
          Go again
        </button>
        <button
          onClick={onLeave}
          className="rounded-lg border border-ink-200 px-5 py-3 font-medium hover:bg-ink-100 sm:py-2.5 dark:border-ink-800 dark:hover:bg-ink-900"
        >
          Back to decks
        </button>
      </div>
    </div>
  );
}

/** The recap window is 24 hours, so it's today or yesterday and nothing else. */
function finishedLabel(at: number, now = Date.now()): string {
  const day = (t: number) => new Date(t).setHours(0, 0, 0, 0);
  return day(at) === day(now) ? 'today' : 'yesterday';
}

function truncate(s: string, max = 40): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
