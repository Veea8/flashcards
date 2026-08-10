/**
 * Pure derivations for the dashboard. No DB access here on purpose — every
 * function takes plain arrays so it can be unit-tested with synthetic data.
 */
import type { Card, CardState, Deck, Rating, ReviewLog } from '../db/schema';
import { byName } from './order';

/**
 * Study days start at 4am, so a session that runs past midnight still counts
 * toward the day it felt like.
 */
export const DAY_CUTOFF_HOUR = 4;
const DAY_MS = 86_400_000;

/** The study day a timestamp belongs to, as a local "YYYY-MM-DD" key. */
export function dayKey(ts: number, cutoffHour = DAY_CUTOFF_HOUR): string {
  const d = new Date(ts);
  d.setHours(d.getHours() - cutoffHour);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Epoch ms at which the study day containing `ts` began. */
export function dayStart(ts: number, cutoffHour = DAY_CUTOFF_HOUR): number {
  const d = new Date(ts);
  d.setHours(d.getHours() - cutoffHour);
  d.setHours(cutoffHour, 0, 0, 0);
  return d.getTime();
}

/** Sequence of day keys ending at `end`, inclusive, oldest first. */
export function dayKeysEnding(end: number, count: number, cutoffHour = DAY_CUTOFF_HOUR): string[] {
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) keys.push(dayKey(end - i * DAY_MS, cutoffHour));
  return keys;
}

export interface DayCount {
  day: string;
  again: number;
  hard: number;
  good: number;
  easy: number;
  total: number;
}

export function reviewsByDay(
  reviews: ReviewLog[],
  end: number,
  days: number,
  cutoffHour = DAY_CUTOFF_HOUR,
): DayCount[] {
  const empty = () => ({ again: 0, hard: 0, good: 0, easy: 0, total: 0 });
  const buckets = new Map<string, ReturnType<typeof empty>>();
  for (const day of dayKeysEnding(end, days, cutoffHour)) buckets.set(day, empty());

  const field: Record<Rating, keyof ReturnType<typeof empty>> = {
    1: 'again',
    2: 'hard',
    3: 'good',
    4: 'easy',
  };

  for (const r of reviews) {
    const bucket = buckets.get(dayKey(r.reviewedAt, cutoffHour));
    if (!bucket) continue;
    bucket[field[r.rating]]++;
    bucket.total++;
  }

  return [...buckets].map(([day, counts]) => ({ day, ...counts }));
}

export interface Streak {
  current: number;
  longest: number;
}

/**
 * Consecutive study days. Today not being studied yet does not break the
 * current streak — yesterday still counts, which is what people expect at 9am.
 */
export function streaks(
  reviews: ReviewLog[],
  now: number,
  cutoffHour = DAY_CUTOFF_HOUR,
): Streak {
  const studied = new Set(reviews.map((r) => dayKey(r.reviewedAt, cutoffHour)));
  if (studied.size === 0) return { current: 0, longest: 0 };

  const today = dayKey(now, cutoffHour);
  const yesterday = dayKey(now - DAY_MS, cutoffHour);

  let current = 0;
  if (studied.has(today) || studied.has(yesterday)) {
    let cursor = studied.has(today) ? now : now - DAY_MS;
    while (studied.has(dayKey(cursor, cutoffHour))) {
      current++;
      cursor -= DAY_MS;
    }
  }

  // Longest run over the observed range.
  const sorted = [...studied].sort();
  let longest = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(`${sorted[i - 1]}T00:00:00`).getTime();
    const cur = new Date(`${sorted[i]}T00:00:00`).getTime();
    run = Math.round((cur - prev) / DAY_MS) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }

  return { current, longest: Math.max(longest, current) };
}

/**
 * Share of reviews rated Good or Easy, over the given window. Null if no data.
 *
 * Cram answers are excluded: retention measures whether the scheduler picked
 * the right interval, and a card you drilled four times in one sitting says
 * nothing about that. Cram still counts everywhere else — it was real study.
 */
export function retention(reviews: ReviewLog[], since = 0): number | null {
  const window = reviews.filter((r) => r.mode !== 'cram' && r.reviewedAt >= since);
  if (window.length === 0) return null;
  const recalled = window.filter((r) => r.rating >= 3).length;
  return recalled / window.length;
}

export interface TodayTotals {
  reviewed: number;
  timeMs: number;
}

export function today(
  reviews: ReviewLog[],
  now: number,
  cutoffHour = DAY_CUTOFF_HOUR,
): TodayTotals {
  const key = dayKey(now, cutoffHour);
  const mine = reviews.filter((r) => dayKey(r.reviewedAt, cutoffHour) === key);
  return {
    reviewed: mine.length,
    timeMs: mine.reduce((sum, r) => sum + r.durationMs, 0),
  };
}

export type StateMix = Record<CardState, number>;

export function stateMix(cards: Card[]): StateMix {
  const mix: StateMix = { 0: 0, 1: 0, 2: 0, 3: 0 };
  for (const c of cards) mix[c.state]++;
  return mix;
}

export interface UpcomingDay {
  day: string;
  count: number;
}

/** Cards falling due per day over the next `days` days, including overdue today. */
export function upcomingWorkload(
  cards: Card[],
  now: number,
  days: number,
  cutoffHour = DAY_CUTOFF_HOUR,
): UpcomingDay[] {
  const keys = dayKeysEnding(now + (days - 1) * DAY_MS, days, cutoffHour);
  const counts = new Map(keys.map((k) => [k, 0]));
  const todayKey = keys[0];

  for (const card of cards) {
    // Anything already due lands on today's bar.
    const key = card.due <= now ? todayKey : dayKey(card.due, cutoffHour);
    if (counts.has(key)) counts.set(key, counts.get(key)! + 1);
  }

  return keys.map((day) => ({ day, count: counts.get(day)! }));
}

export interface DeckStats {
  id: string;
  name: string;
  /** Nesting level; 0 for a top-level deck. */
  depth: number;
  total: number;
  due: number;
  starred: number;
  retention: number | null;
  lastStudied: number | null;
}

/**
 * One row per deck, in tree order, with every figure covering the deck AND its
 * subdecks — a parent that holds no cards itself would otherwise read as empty
 * when all the work is one level down.
 */
export function perDeck(
  decks: Deck[],
  cards: Card[],
  reviews: ReviewLog[],
  now: number,
): DeckStats[] {
  const childrenOf = new Map<string, Deck[]>();
  const roots: Deck[] = [];
  for (const deck of decks) {
    if (!deck.parentId) {
      roots.push(deck);
      continue;
    }
    const list = childrenOf.get(deck.parentId);
    if (list) list.push(deck);
    else childrenOf.set(deck.parentId, [deck]);
  }

  // A deck orphaned by bad data would otherwise vanish from the table.
  const seen = new Set<string>();
  const rows: DeckStats[] = [];

  const walk = (deck: Deck, depth: number) => {
    if (seen.has(deck.id)) return;
    seen.add(deck.id);

    const kids = childrenOf.get(deck.id) ?? [];
    const subtree = new Set([deck.id, ...collectIds(kids, childrenOf)]);
    const own = cards.filter((c) => subtree.has(c.deckId));
    const logs = reviews.filter((r) => subtree.has(r.deckId));

    rows.push({
      id: deck.id,
      name: deck.name,
      depth,
      total: own.length,
      due: own.filter((c) => c.due <= now).length,
      starred: own.filter((c) => c.starred === 1).length,
      retention: retention(logs),
      lastStudied: logs.length ? Math.max(...logs.map((r) => r.reviewedAt)) : null,
    });

    for (const kid of [...kids].sort((a, b) => byName(a.name, b.name))) {
      walk(kid, depth + 1);
    }
  };

  for (const root of roots) walk(root, 0);
  for (const deck of decks) walk(deck, 0); // pick up any orphans
  return rows;
}

function collectIds(decks: Deck[], childrenOf: Map<string, Deck[]>): string[] {
  return decks.flatMap((d) => [d.id, ...collectIds(childrenOf.get(d.id) ?? [], childrenOf)]);
}

export function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}
