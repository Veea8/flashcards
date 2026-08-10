import { describe, expect, it } from 'vitest';
import type { Card } from '../db/schema';
import { answer, makeBatches, shuffle, startBatch, BATCH_SIZE } from './cram';

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
