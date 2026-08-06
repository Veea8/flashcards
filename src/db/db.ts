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

// v2 adds tags + an HTML flag to cards. `*tags` is a multi-entry index, ready
// for tag filtering; the upgrade backfills decks imported before v2.
db.version(2)
  .stores({
    decks: 'id, name, createdAt',
    cards: 'id, deckId, due, starred, *tags, [deckId+due], [deckId+starred]',
    reviews: 'id, cardId, deckId, reviewedAt',
  })
  .upgrade((tx) =>
    tx
      .table('cards')
      .toCollection()
      .modify((card: Partial<Card>) => {
        card.tags ??= [];
        card.html ??= false;
      }),
  );

// v3 adds subdecks. `parentId` is left undefined on top-level decks, which
// IndexedDB simply omits from the index — so the index only ever lists children.
db.version(3).stores({
  decks: 'id, name, createdAt, parentId',
  cards: 'id, deckId, due, starred, *tags, [deckId+due], [deckId+starred]',
  reviews: 'id, cardId, deckId, reviewedAt',
});

export function newId(): string {
  return crypto.randomUUID();
}
