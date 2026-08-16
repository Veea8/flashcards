import { describe, expect, it } from 'vitest';
import type { Card } from '../db/schema';
import {
  answer,
  completedLabel,
  isCompleted,
  isFinished,
  makeBatches,
  recapOf,
  restoreSession,
  shuffle,
  snapshotOf,
  startBatch,
  BATCH_SIZE,
  type CramProgress,
} from './cram';

function card(front: string): Card {
  return {
    id: front,
    deckId: 'd1',
    front,
    back: `${front}!`,
    tags: [],
    html: false,
    createdAt: 0,
    starred: 0,
    due: 0,
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    learning_steps: 0,
    reps: 0,
    lapses: 0,
    state: 0,
  };
}

const deck = (n: number) => Array.from({ length: n }, (_, i) => card(`c${i + 1}`));

/** Answers the head repeatedly, following the queue as it changes. */
function run(queue: ReturnType<typeof startBatch>, answers: boolean[]) {
  return answers.reduce((q, correct) => answer(q, correct), queue);
}

describe('makeBatches', () => {
  it('splits into sixes with a short final batch', () => {
    const batches = makeBatches(deck(14));
    expect(batches.map((b) => b.length)).toEqual([6, 6, 2]);
    expect(batches[0][0].front).toBe('c1');
    expect(batches[2][0].front).toBe('c13');
  });

  it('makes a single batch of a deck smaller than the batch size', () => {
    expect(makeBatches(deck(3))).toHaveLength(1);
    expect(BATCH_SIZE).toBe(6);
  });
});

describe('answering', () => {
  it('drops a card you get right first time', () => {
    const q = answer(startBatch(deck(6)), true);
    expect(q).toHaveLength(5);
    expect(q[0].card.front).toBe('c2');
  });

  it('sends a missed card back a few places rather than to the end', () => {
    const q = answer(startBatch(deck(6)), false);
    expect(q).toHaveLength(6);
    expect(q.map((i) => i.card.front)).toEqual(['c2', 'c3', 'c4', 'c1', 'c5', 'c6']);
    expect(q[3]).toMatchObject({ remaining: 2, missed: true });
  });

  it('needs two clean passes on a card that was missed', () => {
    // Miss c1, clear the three cards ahead of it, then get c1 right once.
    let q = run(startBatch(deck(6)), [false, true, true, true, true]);
    expect(q.find((i) => i.card.front === 'c1')).toMatchObject({ remaining: 1, missed: true });

    // Clear the two cards now ahead of it; the next correct answer is c1's
    // second clean pass, which finally graduates it.
    q = run(q, [true, true, true]);
    expect(q.some((i) => i.card.front === 'c1')).toBe(false);
  });

  it('re-arms the two-pass rule if you miss it again', () => {
    const q = run(startBatch(deck(6)), [false, true, true, true, false]);
    expect(q.find((i) => i.card.front === 'c1')).toMatchObject({ remaining: 2 });
  });

  it('empties only once every card is clean', () => {
    // Six firsts-time-right answers finish a batch of six.
    expect(run(startBatch(deck(6)), Array(6).fill(true))).toHaveLength(0);
  });

  it('keeps repeating the last card until it is right', () => {
    const one = startBatch(deck(1));
    expect(answer(one, false).map((i) => i.card.front)).toEqual(['c1']);
    expect(run(one, [false, true, true])).toHaveLength(0);
  });

  it('is a no-op on an empty queue', () => {
    expect(answer([], true)).toEqual([]);
  });
});

describe('saving and resuming', () => {
  /** A 14-card run with the first set cleared and the second under way. */
  function midRun(): { cards: Card[]; progress: CramProgress } {
    const cards = deck(14);
    const batches = makeBatches(cards);
    return {
      cards,
      progress: {
        batches,
        batchIndex: 1,
        queue: answer(startBatch(batches[1]), false),
        resting: false,
        missed: [cards[6]],
        answered: 7,
      },
    };
  }

  it('round-trips a run through the stored snapshot', () => {
    const { cards, progress } = midRun();
    const restored = restoreSession(snapshotOf('d1', progress), cards);

    expect(restored).not.toBeNull();
    expect(restored!.batchIndex).toBe(1);
    expect(restored!.answered).toBe(7);
    expect(restored!.missed.map((c) => c.front)).toEqual(['c7']);
    expect(restored!.queue.map((i) => i.card.front)).toEqual(
      progress.queue.map((i) => i.card.front),
    );
    expect(restored!.queue[3]).toMatchObject({ remaining: 2, missed: true });
    // The batches you already cleared are still there, so "set 2 of 3" holds.
    expect(restored!.batches.map((b) => b.length)).toEqual([6, 6, 2]);
  });

  it('keeps the shuffled order rather than the deck order', () => {
    const cards = deck(6);
    const shuffled = [cards[3], cards[0], cards[5], cards[1], cards[4], cards[2]];
    const snap = snapshotOf('d1', {
      batches: makeBatches(shuffled),
      batchIndex: 0,
      queue: startBatch(shuffled),
      resting: false,
      missed: [],
      answered: 0,
    });

    const restored = restoreSession(snap, cards);
    expect(restored!.batches[0].map((c) => c.front)).toEqual(shuffled.map((c) => c.front));
  });

  it('resumes at the checkpoint between two sets', () => {
    const cards = deck(14);
    const batches = makeBatches(cards);
    const snap = snapshotOf('d1', {
      batches,
      batchIndex: 0,
      queue: [],
      resting: true,
      missed: [],
      answered: 6,
    });

    const restored = restoreSession(snap, cards)!;
    expect(restored.resting).toBe(true);
    expect(restored.batchIndex).toBe(0);
  });

  it('drops cards deleted since the run started', () => {
    const { cards, progress } = midRun();
    const snap = snapshotOf('d1', progress);
    const left = cards.filter((c) => c.front !== 'c8' && c.front !== 'c14');

    const restored = restoreSession(snap, left)!;
    expect(restored.queue.some((i) => i.card.front === 'c8')).toBe(false);
    expect(restored.batches.flat()).toHaveLength(12);
  });

  it('starts fresh when the saved run is finished or gone', () => {
    const cards = deck(6);
    const batches = makeBatches(cards);
    const done = snapshotOf('d1', {
      batches,
      batchIndex: 0,
      queue: [],
      resting: true,
      missed: [],
      answered: 6,
    });
    expect(restoreSession(done, cards)).toBeNull();

    // Every card in the run has since been deleted.
    expect(restoreSession(snapshotOf('d1', { ...midRun().progress }), [])).toBeNull();
  });

  it('knows a run is finished only on the last set', () => {
    const batches = makeBatches(deck(14));
    const base = { batches, queue: [], resting: true, missed: [], answered: 0 };
    expect(isFinished({ ...base, batchIndex: 1 })).toBe(false);
    expect(isFinished({ ...base, batchIndex: 2 })).toBe(true);
    expect(isFinished({ ...base, batches: [], batchIndex: 0 })).toBe(true);
  });
});

describe('finishing a run', () => {
  /** A 12-card deck drilled to the end: both sets clean. */
  function done(at: number) {
    const cards = deck(12);
    const batches = makeBatches(cards);
    return {
      cards,
      session: {
        ...snapshotOf('d1', {
          batches,
          batchIndex: 1,
          queue: [],
          resting: true,
          missed: [cards[2], cards[9]],
          answered: 15,
        }),
        completedAt: at,
      },
    };
  }

  it('recaps a finished run instead of resuming it', () => {
    const { cards, session } = done(Date.now() - 60_000);

    // Nothing to resume — but plenty to say about it.
    expect(restoreSession(session, cards)).toBeNull();
    const recap = recapOf(session, cards)!;
    expect(recap.total).toBe(12);
    expect(recap.answered).toBe(15);
    expect(recap.missed.map((c) => c.front)).toEqual(['c3', 'c10']);
    expect(recap.added).toBe(0);
  });

  it('stays finished however long ago it was', () => {
    const year = 365 * 86_400_000;
    const { cards, session } = done(Date.now() - year);

    expect(isCompleted(session)).toBe(true);
    expect(recapOf(session, cards)?.total).toBe(12);
  });

  it('counts only the cards that still exist, and flags ones added since', () => {
    const { cards, session } = done(Date.now());
    const now = [...cards.filter((c) => c.front !== 'c3' && c.front !== 'c5'), card('new')];

    const recap = recapOf(session, now)!;
    expect(recap.total).toBe(10);
    expect(recap.added).toBe(1);
    expect(recap.missed.map((c) => c.front)).toEqual(['c10']);
  });

  it('has nothing to recap once every card in the run is gone', () => {
    const { session } = done(Date.now());
    expect(recapOf(session, [])).toBeNull();
  });

  it('has nothing to recap while a run is still in flight', () => {
    const cards = deck(12);
    const live = snapshotOf('d1', {
      batches: makeBatches(cards),
      batchIndex: 0,
      queue: [],
      resting: true,
      missed: [],
      answered: 6,
    });
    expect(isCompleted(live)).toBe(false);
    expect(recapOf(live, cards)).toBeNull();
    expect(restoreSession(live, cards)).not.toBeNull();
  });

  it('says how long ago in words, then falls back to a date', () => {
    const now = new Date('2026-08-16T10:00:00').getTime();
    const at = (iso: string) => completedLabel(new Date(iso).getTime(), now);

    expect(at('2026-08-16T01:00:00')).toBe('today');
    expect(at('2026-08-15T23:00:00')).toBe('yesterday');
    expect(at('2026-08-12T09:00:00')).toBe('4 days ago');
    // A month out, "43 days ago" stops meaning anything — give the date.
    expect(at('2026-07-04T09:00:00')).toMatch(/^on /);
  });
});

describe('shuffle', () => {
  it('keeps every card exactly once', () => {
    const cards = deck(20);
    const out = shuffle(cards);
    expect(out).toHaveLength(20);
    expect(out.map((c) => c.front).sort()).toEqual(cards.map((c) => c.front).sort());
  });

  it('does not mutate its input', () => {
    const cards = deck(5);
    shuffle(cards, () => 0.99);
    expect(cards.map((c) => c.front)).toEqual(['c1', 'c2', 'c3', 'c4', 'c5']);
  });
});
