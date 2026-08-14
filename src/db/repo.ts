import type { UpdateSpec } from 'dexie';
import { db, newId } from './db';
import type { Card, CramSession, Deck, FsrsState, Rating, ReviewLog } from './schema';
import { newCardState } from '../lib/scheduler';
import { byName } from '../lib/order';

/** A card is live unless it has been soft-deleted. */
export const isLive = (c: Card) => c.deletedAt == null;

export interface DeckCounts {
  total: number;
  due: number;
  starred: number;
  newCards: number;
}

/** A deck plus its own counts and the counts of its whole subtree. */
export interface DeckNode extends Deck, DeckCounts {
  children: DeckNode[];
  /** Counts including every descendant — what the deck list shows. */
  rollup: DeckCounts;
}

/** What an import supplies for one card. */
export interface CardInput {
  front: string;
  back: string;
  tags?: string[];
}

/** One subdeck's worth of an import. An empty path means the parent deck. */
export interface DeckGroupInput {
  path: string[];
  cards: CardInput[];
}

function makeCards(deckId: string, pairs: CardInput[], html: boolean, now: number): Card[] {
  return pairs.map((p) => ({
    id: newId(),
    deckId,
    front: p.front,
    back: p.back,
    tags: p.tags ?? [],
    html,
    createdAt: now,
    starred: 0 as const,
    ...newCardState(now),
  }));
}

/**
 * Creates a parent deck plus a subdeck per group, nesting on the group's path
 * so an Anki `A::B::C` deck name becomes three levels. Returns the parent id.
 */
export async function importDeckTree(
  rootName: string,
  groups: DeckGroupInput[],
  opts: { sourceFilename?: string; html?: boolean } = {},
): Promise<string> {
  const now = Date.now();
  const html = opts.html ?? false;
  const rootId = newId();

  const decks: Deck[] = [
    { id: rootId, name: rootName, createdAt: now, sourceFilename: opts.sourceFilename },
  ];
  const cards: Card[] = [];
  /** path key -> deck id, so sibling groups reuse the same ancestors. */
  const byPath = new Map<string, string>([['', rootId]]);

  for (const group of groups) {
    let parentId = rootId;
    let key = '';

    for (const segment of group.path) {
      key = key ? `${key}::${segment}` : segment;
      let id = byPath.get(key);
      if (!id) {
        id = newId();
        byPath.set(key, id);
        decks.push({ id, name: segment, createdAt: now, parentId });
      }
      parentId = id;
    }

    cards.push(...makeCards(parentId, group.cards, html, now));
  }

  await db.transaction('rw', db.decks, db.cards, async () => {
    await db.decks.bulkAdd(decks);
    await db.cards.bulkAdd(cards);
  });

  return rootId;
}

/** Single flat deck — the no-subdecks path. */
export async function createDeckFromCards(
  name: string,
  pairs: CardInput[],
  sourceFilename?: string,
  html = false,
): Promise<string> {
  return importDeckTree(name, [{ path: [], cards: pairs }], { sourceFilename, html });
}

export async function addCardsToDeck(
  deckId: string,
  pairs: CardInput[],
  html = false,
): Promise<number> {
  const cards = makeCards(deckId, pairs, html, Date.now());
  await db.cards.bulkAdd(cards);
  return cards.length;
}

/** The deck itself plus every descendant. Studying a parent covers its children. */
export async function subtreeIds(deckId: string, decks?: Deck[]): Promise<string[]> {
  const all = decks ?? (await db.decks.toArray());
  const childrenOf = new Map<string, string[]>();
  for (const d of all) {
    if (!d.parentId) continue;
    const list = childrenOf.get(d.parentId);
    if (list) list.push(d.id);
    else childrenOf.set(d.parentId, [d.id]);
  }

  const ids: string[] = [];
  const stack = [deckId];
  while (stack.length) {
    const id = stack.pop()!;
    ids.push(id);
    stack.push(...(childrenOf.get(id) ?? []));
  }
  return ids;
}

function countCards(cards: Card[], now: number): DeckCounts {
  return {
    total: cards.length,
    due: cards.filter((c) => c.due <= now).length,
    starred: cards.filter((c) => c.starred === 1).length,
    newCards: cards.filter((c) => c.state === 0).length,
  };
}

function addCounts(a: DeckCounts, b: DeckCounts): DeckCounts {
  return {
    total: a.total + b.total,
    due: a.due + b.due,
    starred: a.starred + b.starred,
    newCards: a.newCards + b.newCards,
  };
}

/** Top-level decks, each with its children nested and counts rolled up. */
export async function listDeckTree(now = Date.now()): Promise<DeckNode[]> {
  const [decks, cards] = await Promise.all([
    db.decks.orderBy('createdAt').toArray(),
    db.cards.toArray(),
  ]);

  const live = cards.filter(isLive);
  const byDeck = new Map<string, Card[]>();
  for (const card of live) {
    const list = byDeck.get(card.deckId);
    if (list) list.push(card);
    else byDeck.set(card.deckId, [card]);
  }

  const nodes = new Map<string, DeckNode>();
  for (const deck of decks) {
    const counts = countCards(byDeck.get(deck.id) ?? [], now);
    nodes.set(deck.id, { ...deck, ...counts, children: [], rollup: counts });
  }

  const roots: DeckNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const rollup = (node: DeckNode): DeckCounts => {
    // By name, numerically: a course deck's "Topic 2" belongs before "Topic 10",
    // and lecture order matters more than which subdeck happens to be biggest.
    node.children.sort((a, b) => byName(a.name, b.name));
    for (const child of node.children) node.rollup = addCounts(node.rollup, rollup(child));
    return node.rollup;
  };
  for (const root of roots) rollup(root);

  roots.reverse(); // newest import first
  return roots;
}

export async function getDeck(deckId: string): Promise<Deck | undefined> {
  return db.decks.get(deckId);
}

async function subtreeCards(deckId: string): Promise<Card[]> {
  const ids = await subtreeIds(deckId);
  return db.cards.where('deckId').anyOf(ids).toArray();
}

/** Live cards due in a deck *and its subdecks*, soonest first. */
export async function getDueCards(
  deckId: string,
  opts: { now?: number; starredOnly?: boolean; studyAhead?: boolean } = {},
): Promise<Card[]> {
  const now = opts.now ?? Date.now();
  const all = await subtreeCards(deckId);
  return all
    .filter(isLive)
    .filter((c) => (opts.starredOnly ? c.starred === 1 : true))
    .filter((c) => (opts.studyAhead ? true : c.due <= now))
    .sort((a, b) => a.due - b.due);
}

/** Earliest future due time in a deck subtree, or null if there is none. */
export async function getNextDueAt(deckId: string, now = Date.now()): Promise<number | null> {
  const all = await subtreeCards(deckId);
  const future = all.filter(isLive).filter((c) => c.due > now).map((c) => c.due);
  return future.length ? Math.min(...future) : null;
}

/**
 * The scheduling fields of a card, with every key present — `last_review` is
 * spelled out even when undefined so that writing this back through
 * `db.cards.update` clears it rather than leaving a stale value behind.
 */
export function fsrsStateOf(card: Card): FsrsState {
  return {
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review,
  };
}

/**
 * Persist a graded review: update the card and append its log atomically.
 * Returns the log id, which is what makes the review undoable.
 */
export async function applyReview(
  cardId: string,
  updated: FsrsState,
  log: { rating: Rating; reviewedAt: number; state: ReviewLog['state']; durationMs: number },
): Promise<string | null> {
  const logId = newId();
  return db.transaction('rw', db.cards, db.reviews, async () => {
    const card = await db.cards.get(cardId);
    if (!card) return null;
    // Cast: Dexie's UpdateSpec expands array fields into dotted key paths,
    // which a plain FsrsState (no array fields at all) can't satisfy.
    await db.cards.update(cardId, updated as UpdateSpec<Card>);
    await db.reviews.add({
      id: logId,
      cardId,
      deckId: card.deckId,
      ...log,
    });
    return logId;
  });
}

/**
 * Undo a review: put the card's scheduling back exactly as it was and drop the
 * log row, so the review never happened as far as the dashboard is concerned.
 */
export async function revertReview(
  cardId: string,
  previous: FsrsState,
  logId: string | null,
): Promise<void> {
  await db.transaction('rw', db.cards, db.reviews, async () => {
    await db.cards.update(cardId, previous as UpdateSpec<Card>);
    if (logId) await db.reviews.delete(logId);
  });
}

/**
 * Records a cram answer. Deliberately writes no card fields: cramming must not
 * move a card's due date, or a week of drilling would flatten the schedule you
 * still want after the exam.
 */
export async function logCramAnswer(
  card: Card,
  correct: boolean,
  durationMs: number,
  at = Date.now(),
): Promise<void> {
  await db.reviews.add({
    id: newId(),
    cardId: card.id,
    deckId: card.deckId,
    rating: correct ? 3 : 1,
    reviewedAt: at,
    state: card.state,
    durationMs,
    mode: 'cram',
  });
}

/** Stores (or replaces) the deck's in-flight cram run. */
export async function saveCramSession(session: CramSession): Promise<void> {
  await db.cram.put(session);
}

export async function getCramSession(deckId: string): Promise<CramSession | undefined> {
  return db.cram.get(deckId);
}

export async function clearCramSession(deckId: string): Promise<void> {
  await db.cram.delete(deckId);
}

/** Deck id -> unfinished run, for showing "resume" on the deck list. */
export async function cramSessions(): Promise<Map<string, CramSession>> {
  const all = await db.cram.toArray();
  return new Map(all.map((s) => [s.deckId, s]));
}

export async function toggleStar(cardId: string): Promise<0 | 1> {
  const card = await db.cards.get(cardId);
  if (!card) return 0;
  const next: 0 | 1 = card.starred === 1 ? 0 : 1;
  await db.cards.update(cardId, { starred: next });
  return next;
}

/** Soft delete — recoverable via restoreCard, and review history is kept. */
export async function softDeleteCard(cardId: string, at = Date.now()): Promise<void> {
  await db.cards.update(cardId, { deletedAt: at });
}

export async function restoreCard(cardId: string): Promise<void> {
  await db.cards.update(cardId, { deletedAt: undefined });
}

/** Deletes a deck and everything under it. */
export async function deleteDeck(deckId: string): Promise<void> {
  const ids = await subtreeIds(deckId);
  await db.transaction('rw', db.decks, db.cards, db.reviews, db.cram, async () => {
    await db.cards.where('deckId').anyOf(ids).delete();
    await db.reviews.where('deckId').anyOf(ids).delete();
    await db.cram.bulkDelete(ids);
    await db.decks.bulkDelete(ids);
  });
}

export async function getAllLiveCards(): Promise<Card[]> {
  return (await db.cards.toArray()).filter(isLive);
}

export async function getAllReviews(): Promise<ReviewLog[]> {
  return db.reviews.orderBy('reviewedAt').toArray();
}

export async function getReviewsSince(since: number): Promise<ReviewLog[]> {
  return db.reviews.where('reviewedAt').aboveOrEqual(since).toArray();
}

/**
 * Every card in a deck subtree (or in every deck when no id is given),
 * **including soft-deleted ones** — the browser needs them for its "deleted"
 * filter and to offer restore.
 */
export async function browseCards(deckId?: string): Promise<Card[]> {
  if (!deckId) return db.cards.toArray();
  const ids = await subtreeIds(deckId);
  return db.cards.where('deckId').anyOf(ids).toArray();
}

/** Deck id -> name, for labelling cards that came from a subdeck. */
export async function deckNames(): Promise<Map<string, string>> {
  const decks = await db.decks.toArray();
  return new Map(decks.map((d) => [d.id, d.name]));
}
