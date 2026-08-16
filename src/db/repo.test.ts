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
  browseCards,
  clearCramSession,
  completeCramSession,
  cramSessions,
  createDeckFromCards,
  deleteDeck,
  fsrsStateOf,
  getAllLiveCards,
  getAllReviews,
  getCramSession,
  getDueCards,
  getNextDueAt,
  getReviewsSince,
  importDeckTree,
  listDeckTree,
  logCramAnswer,
  restoreCard,
  revertReview,
  saveCramSession,
  softDeleteCard,
  subtreeIds,
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

    const [node] = await listDeckTree();
    expect(node).toMatchObject({ name: 'French', total: 3, due: 3, newCards: 3, starred: 0 });
    expect(node.children).toHaveLength(0);
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

describe('undoing a review', () => {
  it('restores the exact schedule and drops the log', async () => {
    const deckId = await createDeckFromCards('French', PAIRS);
    const [card] = await getDueCards(deckId);
    const now = Date.now();

    const logId = await applyReview(card.id, gradeCard(card, 1, now), {
      rating: 1,
      reviewedAt: now,
      state: card.state,
      durationMs: 1000,
    });
    expect(logId).toBeTypeOf('string');

    await revertReview(card.id, fsrsStateOf(card), logId);

    const back = (await db.cards.get(card.id))!;
    expect(back).toMatchObject({
      due: card.due,
      state: card.state,
      reps: card.reps,
      lapses: card.lapses,
      stability: card.stability,
    });
    // A first review must leave no trace: last_review is cleared, not stale.
    expect(back.last_review).toBeUndefined();
    expect(await getAllReviews()).toHaveLength(0);
  });

  it('undoes only the last of several reviews', async () => {
    const deckId = await createDeckFromCards('French', PAIRS);
    const cards = await getDueCards(deckId);
    const now = Date.now();

    for (const c of cards.slice(0, 2)) {
      await applyReview(c.id, gradeCard(c, 3, now), {
        rating: 3,
        reviewedAt: now,
        state: c.state,
        durationMs: 500,
      });
    }
    const last = cards[1];
    const logs = await getAllReviews();
    await revertReview(last.id, fsrsStateOf(last), logs[1].id);

    expect(await getAllReviews()).toHaveLength(1);
    expect((await db.cards.get(last.id))!.state).toBe(0);
    expect((await db.cards.get(cards[0].id))!.state).not.toBe(0);
  });
});

describe('cram answers', () => {
  it('are logged without moving the card an inch', async () => {
    const deckId = await createDeckFromCards('French', PAIRS);
    const [card] = await getDueCards(deckId);

    await logCramAnswer(card, false, 1500);
    await logCramAnswer(card, true, 900);

    const after = (await db.cards.get(card.id))!;
    expect(after).toMatchObject({ due: card.due, state: card.state, reps: 0, lapses: 0 });
    expect(after.last_review).toBeUndefined();

    const logs = await getAllReviews();
    expect(logs.map((r) => r.mode)).toEqual(['cram', 'cram']);
    // Sorted: two answers a millisecond apart can come back in either order,
    // since reviewedAt is the only sort key.
    expect(logs.map((r) => r.rating).sort()).toEqual([1, 3]);
    // The deck still has all three cards waiting for a real review.
    expect(await getDueCards(deckId)).toHaveLength(3);
  });
});

describe('browsing', () => {
  it('returns deleted cards too, scoped to the deck subtree', async () => {
    const rootId = await importDeckTree('AW', [
      { path: [], cards: [{ front: 'loose', back: 'x' }] },
      { path: ['Graphs'], cards: [{ front: 'g1', back: 'c' }] },
    ]);
    await createDeckFromCards('Other', [{ front: 'z', back: 'y' }]);

    const [card] = await getDueCards(rootId);
    await softDeleteCard(card.id);

    const inTree = await browseCards(rootId);
    expect(inTree.map((c) => c.front).sort()).toEqual(['g1', 'loose']);
    expect(inTree.filter((c) => c.deletedAt != null)).toHaveLength(1);
    expect(await browseCards()).toHaveLength(3);
  });

  it('finds the reviews from a given moment onwards', async () => {
    const deckId = await createDeckFromCards('French', PAIRS);
    const cards = await getDueCards(deckId);
    const now = Date.now();
    const yesterday = now - 86_400_000;

    await applyReview(cards[0].id, gradeCard(cards[0], 3, yesterday), {
      rating: 3,
      reviewedAt: yesterday,
      state: 0,
      durationMs: 500,
    });
    await applyReview(cards[1].id, gradeCard(cards[1], 3, now), {
      rating: 3,
      reviewedAt: now,
      state: 0,
      durationMs: 500,
    });

    const recent = await getReviewsSince(now - 3_600_000);
    expect(recent.map((r) => r.cardId)).toEqual([cards[1].id]);
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
    expect((await listDeckTree())[0].rollup.total).toBe(2);

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

describe('subdecks', () => {
  const GROUPS = [
    { path: ['Probability'], cards: [{ front: 'p1', back: 'a' }, { front: 'p2', back: 'b' }] },
    { path: ['Graphs'], cards: [{ front: 'g1', back: 'c' }] },
  ];

  it('nests subdecks under the parent and rolls counts up', async () => {
    const rootId = await importDeckTree('AW', GROUPS);

    const [root] = await listDeckTree();
    expect(root.id).toBe(rootId);
    expect(root.total).toBe(0); // the parent holds no cards of its own
    expect(root.rollup.total).toBe(3); // but its subtree does
    expect(root.rollup.due).toBe(3);

    // Name order, not size order.
    expect(root.children.map((c) => c.name)).toEqual(['Graphs', 'Probability']);
    expect(root.children[1].rollup.total).toBe(2);
    expect(root.children.every((c) => c.parentId === rootId)).toBe(true);
  });

  it('studies a parent across all of its subdecks', async () => {
    const rootId = await importDeckTree('AW', GROUPS);

    const all = await getDueCards(rootId);
    expect(all.map((c) => c.front).sort()).toEqual(['g1', 'p1', 'p2']);

    // A child studies only its own cards.
    const [root] = await listDeckTree();
    const probability = root.children.find((c) => c.name === 'Probability')!;
    expect((await getDueCards(probability.id)).map((c) => c.front).sort()).toEqual(['p1', 'p2']);
  });

  it('builds a deeper tree from a :: style path and reuses ancestors', async () => {
    const rootId = await importDeckTree('AW', [
      { path: ['Algorithms', 'Probability'], cards: [{ front: 'a', back: '1' }] },
      { path: ['Algorithms', 'Graphs'], cards: [{ front: 'b', back: '2' }] },
    ]);

    const [root] = await listDeckTree();
    expect(root.children).toHaveLength(1); // one shared "Algorithms" level
    const algorithms = root.children[0];
    expect(algorithms.name).toBe('Algorithms');
    expect(algorithms.children.map((c) => c.name).sort()).toEqual(['Graphs', 'Probability']);
    expect(algorithms.rollup.total).toBe(2);
    expect(await subtreeIds(rootId)).toHaveLength(4);
  });

  it('keeps ungrouped cards in the parent deck itself', async () => {
    const rootId = await importDeckTree('AW', [
      { path: [], cards: [{ front: 'loose', back: 'x' }] },
      ...GROUPS,
    ]);

    const [root] = await listDeckTree();
    expect(root.total).toBe(1);
    expect(root.rollup.total).toBe(4);
    expect((await getDueCards(rootId)).map((c) => c.front)).toContain('loose');
  });

  it('deletes the whole subtree with the parent', async () => {
    const rootId = await importDeckTree('AW', GROUPS);
    await deleteDeck(rootId);

    expect(await listDeckTree()).toHaveLength(0);
    expect(await db.decks.count()).toBe(0);
    expect(await db.cards.count()).toBe(0);
  });

  it('deletes only one branch when a child is removed', async () => {
    const rootId = await importDeckTree('AW', GROUPS);
    const [root] = await listDeckTree();
    const graphs = root.children.find((c) => c.name === 'Graphs')!;

    await deleteDeck(graphs.id);

    const [after] = await listDeckTree();
    expect(after.children.map((c) => c.name)).toEqual(['Probability']);
    expect(after.rollup.total).toBe(2);
    expect(await getDueCards(rootId)).toHaveLength(2);
  });
});

describe('cram sessions', () => {
  const session = (deckId: string, cardIds: string[]) => ({
    deckId,
    order: cardIds,
    batchIndex: 1,
    queue: cardIds.slice(0, 1).map((cardId) => ({ cardId, remaining: 1, missed: false })),
    resting: false,
    missedIds: [],
    answered: 6,
    updatedAt: Date.now(),
  });

  it('stores one in-flight run per deck and replaces it on save', async () => {
    const deckId = await createDeckFromCards('French', PAIRS);
    const cards = await getDueCards(deckId);

    await saveCramSession(session(deckId, cards.map((c) => c.id)));
    expect((await getCramSession(deckId))?.batchIndex).toBe(1);

    await saveCramSession({ ...session(deckId, cards.map((c) => c.id)), batchIndex: 2 });
    expect(await db.cram.count()).toBe(1);
    expect((await getCramSession(deckId))?.batchIndex).toBe(2);

    await clearCramSession(deckId);
    expect(await getCramSession(deckId)).toBeUndefined();
  });

  it('keeps a finished run as a record, stamped once', async () => {
    const deckId = await createDeckFromCards('French', PAIRS);
    const snapshot = session(deckId, []);

    await completeCramSession(snapshot, 1_000);
    // Re-rendering the summary must not push the timestamp forward.
    await completeCramSession(snapshot, 9_000);
    expect((await getCramSession(deckId))?.completedAt).toBe(1_000);

    // Starting a new run replaces the record rather than inheriting its stamp.
    await saveCramSession(snapshot);
    expect((await getCramSession(deckId))?.completedAt).toBeUndefined();
  });

  it('lists runs by deck, for the resume label on the deck list', async () => {
    const a = await createDeckFromCards('A', PAIRS);
    const b = await createDeckFromCards('B', PAIRS);
    await saveCramSession(session(a, []));

    const runs = await cramSessions();
    expect(runs.has(a)).toBe(true);
    expect(runs.has(b)).toBe(false);
  });

  it('takes the run with the deck when the deck is deleted', async () => {
    const rootId = await importDeckTree('AW', [
      { path: ['Graphs'], cards: [{ front: 'g1', back: 'c' }] },
    ]);
    const [root] = await listDeckTree();
    const child = root.children[0];

    await saveCramSession(session(rootId, []));
    await saveCramSession(session(child.id, []));
    await deleteDeck(rootId);

    expect(await db.cram.count()).toBe(0);
  });
});
