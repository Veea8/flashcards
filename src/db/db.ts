import Dexie, { type EntityTable } from 'dexie';
import type { Card, Deck, ReviewLog } from './schema';

/**
 * Note on `deletedAt`: IndexedDB skips records whose indexed key is undefined,
 * so a live card cannot be found via a `deletedAt` index. Live-ness is
 * therefore filtered in JS (see repo.ts `isLive`), and `deletedAt` is left
 * unindexed on purpose.
 */
export const db = new Dexie('flashcards') as Dexie & {
  decks: EntityTable<Deck, 'id'>;
  cards: EntityTable<Card, 'id'>;
  reviews: EntityTable<ReviewLog, 'id'>;
};

db.version(1).stores({
  decks: 'id, name, createdAt',
  cards: 'id, deckId, due, starred, [deckId+due], [deckId+starred]',
  reviews: 'id, cardId, deckId, reviewedAt',
});

export function newId(): string {
  return crypto.randomUUID();
}
