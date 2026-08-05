/**
 * Integration test over the real Dexie stack (backed by fake-indexeddb), so
 * the import → study → star → delete → undo path is exercised end to end
 * exactly as the UI drives it.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import {
  addCardsToDeck,
  applyReview,
  createDeckFromCards,
  getAllLiveCards,
  getAllReviews,
  getDueCards,
  getNextDueAt,
  listDeckSummaries,
  restoreCard,
  softDeleteCard,
  toggleStar,
} from './repo';
import { gradeCard } from '../lib/scheduler';
import { retention, stateMix } from '../lib/stats';

const PAIRS = [
  { front: 'bonjour', back: 'hello' },
  { front: 'merci', back: 'thank you' },
  { front: 'au revoir', back: 'goodbye' },
];

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('deck import', () => {
  it('creates a deck whose cards are all new and due immediately', async () => {
    const deckId = await createDeckFromCards('French', PAIRS, 'french.txt');

    const due = await getDueCards(deckId);
    expect(due).toHaveLength(3);
    expect(due.every((c) => c.state === 0)).toBe(true);
    expect(due.every((c) => c.due <= Date.now())).toBe(true);

    const [summary] = await listDeckSummaries();
    expect(summary).toMatchObject({ name: 'French', total: 3, due: 3, newCards: 3, starred: 0 });
  });
});

describe('reviewing', () => {
  it('persists the new schedule and a review log', async () => {
    const deckId = await createDeckFromCards('French', PAIRS);
    const [card] = await getDueCards(deckId);
    const now = Date.now();

    const updated = gradeCard(card, 3, now);
    await applyReview(card.id, updated, {
      rating: 3,
      reviewedAt: now,
      state: card.state,
      durationMs: 4200,
    });

    const stored = await db.cards.get(card.id);
    expect(stored!.due).toBe(updated.due);
    expect(stored!.due).toBeGreaterThan(now);
    expect(stored!.reps).toBe(1);
    expect(stored!.state).not.toBe(0);

    const logs = await getAllReviews();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      cardId: card.id,
      deckId,
      rating: 3,
      durationMs: 4200,
      state: 0, // state *before* the review
    });
  });

  it('brings an "Again" card back within the same session', async () => {
    const deckId = await createDeckFromCards('French', PAIRS);
    const [card] = await getDueCards(deckId);
    const now = Date.now();

    const updated = gradeCard(card, 1, now);
    // Learning steps land minutes away, not days — that is what lets the
    // study loop requeue the card instead of ending the session.
    expect(updated.due - now).toBeLessThan(20 * 60 * 1000);
  });

  it('schedules Easy further out than Good, and Good further than Hard', async () => {
    const deckId = await createDeckFromCards('French', PAIRS);
    const [card] = await getDueCards(deckId);
    const now = Date.now();

    const hard = gradeCard(card, 2, now).due;
    const good = gradeCard(card, 3, now).due;
    const easy = gradeCard(card, 4, now).due;
    expect(good).toBeGreaterThan(hard);
    expect(easy).toBeGreaterThan(good);
  });
});

describe('starring', () => {
  it('toggles, persists, and does not touch scheduling', async () => {
    const deckId = await createDeckFromCards('French', PAIRS);
    const [card] = await getDueCards(deckId);

    expect(await toggleStar(card.id)).toBe(1);
    const starred = await db.cards.get(card.id);
    expect(starred!.starred).toBe(1);
    expect(starred!.due).toBe(card.due);
    expect(starred!.reps).toBe(card.reps);

    const onlyStarred = await getDueCards(deckId, { starredOnly: true });
    expect(onlyStarred.map((c) => c.id)).toEqual([card.id]);

    expect(await toggleStar(card.id)).toBe(0);
    expect((await getDueCards(deckId, { starredOnly: true }))).toHaveLength(0);
  });
});

describe('soft delete', () => {
  it('hides the card everywhere but keeps its review history', async () => {
    const deckId = await createDeckFromCards('French', PAIRS);
    const [card] = await getDueCards(deckId);
    const now = Date.now();

    await applyReview(card.id, gradeCard(card, 1, now), {
      rating: 1,
      reviewedAt: now,
      state: card.state,
      durationMs: 1000,
    });
    await softDeleteCard(card.id);

    expect(await getDueCards(deckId)).toHaveLength(2);
    expect(await getAllLiveCards()).toHaveLength(2);
    expect((await listDeckSummaries())[0].total).toBe(2);

    // The row is still there, just flagged — and the work still counts.
    expect((await db.cards.get(card.id))!.deletedAt).toBeTypeOf('number');
    expect(await getAllReviews()).toHaveLength(1);
    expect(retention(await getAllReviews())).toBe(0);
  });

  it('restores a deleted card exactly as it was', async () => {
    const deckId = await createDeckFromCards('French', PAIRS);
    const [card] = await getDueCards(deckId);

    await softDeleteCard(card.id);
    await restoreCard(card.id);

    const live = await getDueCards(deckId);
    expect(live).toHaveLength(3);
    expect(live.find((c) => c.id === card.id)).toMatchObject({
      front: card.front,
      due: card.due,
      state: card.state,
    });
  });
});

describe('queue helpers', () => {
  it('reports the next due time once nothing is due', async () => {
    const deckId = await createDeckFromCards('French', PAIRS);
    const now = Date.now();

    for (const card of await getDueCards(deckId)) {
      await applyReview(card.id, gradeCard(card, 4, now), {
        rating: 4,
        reviewedAt: now,
        state: card.state,
        durationMs: 1000,
      });
    }

    expect(await getDueCards(deckId)).toHaveLength(0);
    const next = await getNextDueAt(deckId);
    expect(next).toBeGreaterThan(now);

    // Study-ahead ignores the due filter.
    expect(await getDueCards(deckId, { studyAhead: true })).toHaveLength(3);
  });

  it('tracks state mix as cards move out of New', async () => {
    const deckId = await createDeckFromCards('French', PAIRS);
    await addCardsToDeck(deckId, [{ front: 'le pain', back: 'the bread' }]);
    const now = Date.now();

    const [card] = await getDueCards(deckId);
    await applyReview(card.id, gradeCard(card, 3, now), {
      rating: 3,
      reviewedAt: now,
      state: card.state,
      durationMs: 1000,
    });

    const mix = stateMix(await getAllLiveCards());
    expect(mix[0]).toBe(3);
    expect(mix[1] + mix[2]).toBe(1);
  });
});
