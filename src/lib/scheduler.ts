/**
 * The only module that talks to ts-fsrs. Everything else deals in the flat,
 * epoch-ms `FsrsState` from src/db/schema.ts.
 */
import { createEmptyCard, fsrs, type Card as FsrsCard, type Grade } from 'ts-fsrs';
import type { CardState, FsrsState, Rating } from '../db/schema';

const f = fsrs({ enable_fuzz: true, enable_short_term: true });

/** ts-fsrs Card (Dates) -> our stored state (epoch ms). */
function toState(c: FsrsCard): FsrsState {
  return {
    due: c.due.getTime(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state as CardState,
    last_review: c.last_review ? c.last_review.getTime() : undefined,
  };
}

/** Our stored state (epoch ms) -> ts-fsrs Card (Dates). */
function toFsrs(s: FsrsState): FsrsCard {
  return {
    due: new Date(s.due),
    stability: s.stability,
    difficulty: s.difficulty,
    elapsed_days: s.elapsed_days,
    scheduled_days: s.scheduled_days,
    learning_steps: s.learning_steps,
    reps: s.reps,
    lapses: s.lapses,
    state: s.state,
    last_review: s.last_review ? new Date(s.last_review) : undefined,
  } as FsrsCard;
}

/** A brand-new card, due immediately. */
export function newCardState(now = Date.now()): FsrsState {
  return toState(createEmptyCard(new Date(now)));
}

/** Apply a rating. Returns the new state to persist. */
export function gradeCard(state: FsrsState, rating: Rating, now = Date.now()): FsrsState {
  const { card } = f.next(toFsrs(state), new Date(now), rating as Grade);
  return toState(card);
}

/**
 * The interval each button would produce, as a short human string —
 * shown on the rating buttons so you aren't guessing what a press costs.
 */
export function previewIntervals(state: FsrsState, now = Date.now()): Record<Rating, string> {
  const preview = f.repeat(toFsrs(state), new Date(now));
  const out = {} as Record<Rating, string>;
  for (const rating of [1, 2, 3, 4] as Rating[]) {
    const next = preview[rating as Grade].card.due.getTime();
    out[rating] = formatInterval(next - now);
  }
  return out;
}

/** 45_000 -> "45s", 5_400_000 -> "1.5h", 172_800_000 -> "2d". */
export function formatInterval(ms: number): string {
  const min = ms / 60_000;
  if (min < 1) return '<1m';
  if (min < 60) return `${Math.round(min)}m`;
  const hours = min / 60;
  if (hours < 24) return `${round1(hours)}h`;
  const days = hours / 24;
  if (days < 30) return `${round1(days)}d`;
  const months = days / 30.4;
  if (months < 12) return `${round1(months)}mo`;
  return `${round1(days / 365)}y`;
}

function round1(n: number): string {
  return n < 10 ? String(Math.round(n * 10) / 10) : String(Math.round(n));
}
