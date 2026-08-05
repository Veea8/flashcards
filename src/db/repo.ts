import type { UpdateSpec } from 'dexie';
import { db, newId } from './db';
import type { Card, Deck, FsrsState, Rating, ReviewLog } from './schema';
import { newCardState } from '../lib/scheduler';

/** A card is live unless it has been soft-deleted. */
export const isLive = (c: Card) => c.deletedAt == null;

export interface DeckSummary extends Deck {
  total: number;
  due: number;
  starred: number;
  newCards: number;
}

/** What an import supplies for one card. */
export interface CardInput {
  front: string;
  back: string;
  tags?: string[];
}

export async function createDeckFromCards(
  name: string,
  pairs: CardInput[],
  sourceFilename?: string,
  html = false,
): Promise<string> {
  const now = Date.now();
  const deckId = newId();

  const cards: Card[] = pairs.map((p) => ({
    id: newId(),
    deckId,
    front: p.front,
    back: p.back,
    tags: p.tags ?? [],
    html,
    createdAt: now,
    starred: 0,
    ...newCardState(now),
  }));

  await db.transaction('rw', db.decks, db.cards, async () => {
    await db.decks.add({ id: deckId, name, createdAt: now, sourceFilename });
    await db.cards.bulkAdd(cards);
  });

  return deckId;
}

export async function addCardsToDeck(
  deckId: string,
  pairs: CardInput[],
  html = false,
): Promise<number> {
  const now = Date.now();
  const cards: Card[] = pairs.map((p) => ({
    id: newId(),
    deckId,
    front: p.front,
    back: p.back,
    tags: p.tags ?? [],
    html,
    createdAt: now,
    starred: 0,
    ...newCardState(now),
  }));
  await db.cards.bulkAdd(cards);
  return cards.length;
}

export async function listDeckSummaries(now = Date.now()): Promise<DeckSummary[]> {
  const [decks, cards] = await Promise.all([
    db.decks.orderBy('createdAt').reverse().toArray(),
    db.cards.toArray(),
  ]);

  return decks.map((deck) => {
    const own = cards.filter((c) => c.deckId === deck.id && isLive(c));
    return {
      ...deck,
      total: own.length,
      due: own.filter((c) => c.due <= now).length,
      starred: own.filter((c) => c.starred === 1).length,
      newCards: own.filter((c) => c.state === 0).length,
    };
  });
}

export async function getDeck(deckId: string): Promise<Deck | undefined> {
  return db.decks.get(deckId);
}

/** Live cards in a deck, newest-due first, optionally starred-only. */
export async function getDueCards(
  deckId: string,
  opts: { now?: number; starredOnly?: boolean; studyAhead?: boolean } = {},
): Promise<Card[]> {
  const now = opts.now ?? Date.now();
  const all = await db.cards.where('deckId').equals(deckId).toArray();
  return all
    .filter(isLive)
    .filter((c) => (opts.starredOnly ? c.starred === 1 : true))
    .filter((c) => (opts.studyAhead ? true : c.due <= now))
    .sort((a, b) => a.due - b.due);
}

/** Earliest future due time in a deck, or null if the deck has no live cards. */
export async function getNextDueAt(deckId: string, now = Date.now()): Promise<number | null> {
  const all = await db.cards.where('deckId').equals(deckId).toArray();
  const future = all.filter(isLive).filter((c) => c.due > now).map((c) => c.due);
  return future.length ? Math.min(...future) : null;
}

/** Persist a graded review: update the card and append its log atomically. */
export async function applyReview(
  cardId: string,
  updated: FsrsState,
  log: { rating: Rating; reviewedAt: number; state: ReviewLog['state']; durationMs: number },
): Promise<void> {
  await db.transaction('rw', db.cards, db.reviews, async () => {
    const card = await db.cards.get(cardId);
    if (!card) return;
    // Cast: Dexie's UpdateSpec expands array fields into dotted key paths,
    // which a plain FsrsState (no array fields at all) can't satisfy.
    await db.cards.update(cardId, updated as UpdateSpec<Card>);
    await db.reviews.add({
      id: newId(),
      cardId,
      deckId: card.deckId,
      ...log,
    });
  });
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

export async function deleteDeck(deckId: string): Promise<void> {
  await db.transaction('rw', db.decks, db.cards, db.reviews, async () => {
    await db.cards.where('deckId').equals(deckId).delete();
    await db.reviews.where('deckId').equals(deckId).delete();
    await db.decks.delete(deckId);
  });
}

export async function getAllLiveCards(): Promise<Card[]> {
  return (await db.cards.toArray()).filter(isLive);
}

export async function getAllReviews(): Promise<ReviewLog[]> {
  return db.reviews.orderBy('reviewedAt').toArray();
}
