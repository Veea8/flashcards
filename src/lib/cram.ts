/**
 * Cram batching. Pure functions over plain arrays so the drill rules are
 * testable without a DB or a React tree.
 *
 * The shape is deliberately not FSRS: cramming asks "can I say this right now",
 * so a card leaves the batch once you get it, and a card you missed has to be
 * answered correctly twice before it goes — once to fix it, once to prove it.
 */
import type { Card } from '../db/schema';

/** Cards drilled together before the next set is unlocked. */
export const BATCH_SIZE = 6;

/** Correct answers a card needs after you miss it. */
const AFTER_MISS = 2;

/**
 * How far back a card goes when it needs another pass. Two cards of spacing is
 * enough that you recall it rather than read it off the screen a second later.
 */
const REQUEUE_GAP = 3;

export interface CramItem {
  card: Card;
  /** Correct answers still needed before this card leaves the batch. */
  remaining: number;
  /** True once it has been missed at least once in this session. */
  missed: boolean;
}

/** Splits a deck into fixed-size batches, keeping the given order. */
export function makeBatches(cards: Card[], size = BATCH_SIZE): Card[][] {
  const batches: Card[][] = [];
  for (let i = 0; i < cards.length; i += size) batches.push(cards.slice(i, i + size));
  return batches;
}

export function startBatch(cards: Card[]): CramItem[] {
  return cards.map((card) => ({ card, remaining: 1, missed: false }));
}

/**
 * Answers the card at the head of the queue. A correct answer graduates it (or
 * brings it one pass closer); a miss sends it back needing two clean passes.
 * The batch is done when the returned queue is empty.
 */
export function answer(queue: CramItem[], correct: boolean): CramItem[] {
  if (queue.length === 0) return queue;
  const [head, ...rest] = queue;

  const next: CramItem = correct
    ? { ...head, remaining: head.remaining - 1 }
    : { ...head, remaining: AFTER_MISS, missed: true };

  if (correct && next.remaining <= 0) return rest;

  const at = Math.min(REQUEUE_GAP, rest.length);
  return [...rest.slice(0, at), next, ...rest.slice(at)];
}

/** Fisher–Yates, so repeat sessions don't drill the deck in the same order. */
export function shuffle<T>(items: T[], random = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
