/**
 * Persisted shapes. FSRS state is stored flat on the card and mirrors the
 * `ts-fsrs` Card interface, except that Dates are stored as epoch ms so they
 * are cheap to index and survive structured cloning without surprises.
 * Conversion to/from `ts-fsrs` happens only in src/lib/scheduler.ts.
 */

export type CardState = 0 | 1 | 2 | 3; // New | Learning | Review | Relearning
export type Rating = 1 | 2 | 3 | 4; // Again | Hard | Good | Easy

export interface Deck {
  id: string;
  name: string;
  createdAt: number;
  sourceFilename?: string;
  /** Parent deck, for subdecks. Absent on a top-level deck. */
  parentId?: string;
}

/** The FSRS scheduling fields, stored flat on Card. */
export interface FsrsState {
  due: number; // epoch ms
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: CardState;
  last_review?: number; // epoch ms
}

export interface Card extends FsrsState {
  id: string;
  deckId: string;
  front: string;
  back: string;
  /** Tags from the import (e.g. Anki's tags column). */
  tags: string[];
  /** Content carries HTML markup that should be rendered rather than printed. */
  html: boolean;
  createdAt: number;
  /** "Important" flag. Purely a label — it never influences scheduling. */
  starred: 0 | 1; // IndexedDB cannot index booleans, so 0/1
  /** Soft delete. Absent/undefined means the card is live. */
  deletedAt?: number;
}

export interface ReviewLog {
  id: string;
  cardId: string;
  /** Denormalised so per-deck stats survive card deletion. */
  deckId: string;
  rating: Rating;
  reviewedAt: number;
  /** Card state *before* the review. */
  state: CardState;
  /** Time from reveal to rating, in ms. Feeds "time studied". */
  durationMs: number;
  /**
   * Cram answers are logged so the work shows up as work, but they are not
   * scheduler feedback: absent (the default) means a normal graded review.
   */
  mode?: 'cram';
}

export const RATING_LABELS: Record<Rating, string> = {
  1: 'Again',
  2: 'Hard',
  3: 'Good',
  4: 'Easy',
};

export const STATE_LABELS: Record<CardState, string> = {
  0: 'New',
  1: 'Learning',
  2: 'Review',
  3: 'Relearning',
};
