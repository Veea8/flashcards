import { describe, it, expect } from 'vitest';
import type { Card, Rating, ReviewLog } from '../db/schema';
import {
  dayKey,
  formatDuration,
  retention,
  reviewsByDay,
  stateMix,
  streaks,
  today,
  upcomingWorkload,
} from './stats';

const DAY = 86_400_000;

/** A review at a local wall-clock time, so cutoff behaviour is testable. */
function at(y: number, m: number, d: number, h: number, min = 0): number {
  return new Date(y, m - 1, d, h, min).getTime();
}

function log(reviewedAt: number, rating: Rating = 3, durationMs = 5000): ReviewLog {
  return {
    id: `${reviewedAt}-${rating}-${Math.random()}`,
    cardId: 'c1',
    deckId: 'd1',
    rating,
    reviewedAt,
    state: 2,
    durationMs,
  };
}

function card(partial: Partial<Card>): Card {
  return {
    id: Math.random().toString(),
    deckId: 'd1',
    front: 'f',
    back: 'b',
    createdAt: 0,
    starred: 0,
    due: 0,
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    learning_steps: 0,
    reps: 0,
    lapses: 0,
    state: 0,
    ...partial,
  };
}

describe('dayKey', () => {
  it('puts a 1am session on the previous study day', () => {
    expect(dayKey(at(2026, 3, 10, 1, 30))).toBe('2026-03-09');
  });

  it('puts a 4am session on the new day', () => {
    expect(dayKey(at(2026, 3, 10, 4, 1))).toBe('2026-03-10');
  });

  it('puts an evening session on the same day', () => {
    expect(dayKey(at(2026, 3, 10, 22, 0))).toBe('2026-03-10');
  });
});

describe('streaks', () => {
  it('is zero with no reviews', () => {
    expect(streaks([], at(2026, 3, 10, 12))).toEqual({ current: 0, longest: 0 });
  });

  it('counts consecutive days ending today', () => {
    const now = at(2026, 3, 10, 12);
    const reviews = [log(now), log(now - DAY), log(now - 2 * DAY)];
    expect(streaks(reviews, now).current).toBe(3);
  });

  it('breaks on a gap day', () => {
    const now = at(2026, 3, 10, 12);
    const reviews = [log(now), log(now - DAY), log(now - 3 * DAY), log(now - 4 * DAY)];
    const s = streaks(reviews, now);
    expect(s.current).toBe(2);
    expect(s.longest).toBe(2);
  });

  it('keeps the streak alive when today has not been studied yet', () => {
    const now = at(2026, 3, 10, 9);
    const reviews = [log(now - DAY), log(now - 2 * DAY)];
    expect(streaks(reviews, now).current).toBe(2);
  });

  it('counts a 1am session toward the previous day thanks to the cutoff', () => {
    // Studied Monday evening and again at 1am Tuesday — that is one study day,
    // and by Tuesday noon the streak should read 1, not 2.
    const reviews = [log(at(2026, 3, 9, 23, 0)), log(at(2026, 3, 10, 1, 0))];
    expect(streaks(reviews, at(2026, 3, 10, 12)).current).toBe(1);
  });
});

describe('retention', () => {
  it('is null with no reviews', () => {
    expect(retention([])).toBeNull();
  });

  it('counts Good and Easy as recalled', () => {
    const reviews = [log(1, 1), log(2, 2), log(3, 3), log(4, 4)];
    expect(retention(reviews)).toBe(0.5);
  });

  it('respects the since window', () => {
    const now = at(2026, 3, 10, 12);
    const reviews = [log(now - 40 * DAY, 1), log(now, 3), log(now, 3)];
    expect(retention(reviews, now - 30 * DAY)).toBe(1);
  });
});

describe('reviewsByDay', () => {
  it('buckets by rating and pads empty days', () => {
    const now = at(2026, 3, 10, 12);
    const rows = reviewsByDay([log(now, 1), log(now, 3), log(now - 2 * DAY, 4)], now, 3);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ day: '2026-03-08', easy: 1, total: 1 });
    expect(rows[1]).toMatchObject({ day: '2026-03-09', total: 0 });
    expect(rows[2]).toMatchObject({ day: '2026-03-10', again: 1, good: 1, total: 2 });
  });

  it('ignores reviews outside the window', () => {
    const now = at(2026, 3, 10, 12);
    const rows = reviewsByDay([log(now - 90 * DAY)], now, 7);
    expect(rows.reduce((s, r) => s + r.total, 0)).toBe(0);
  });
});

describe('today', () => {
  it('sums count and time for the current study day only', () => {
    const now = at(2026, 3, 10, 12);
    const t = today([log(now, 3, 4000), log(now, 3, 6000), log(now - DAY, 3, 9000)], now);
    expect(t).toEqual({ reviewed: 2, timeMs: 10_000 });
  });
});

describe('upcomingWorkload', () => {
  it('puts overdue cards on today and buckets the rest by day', () => {
    const now = at(2026, 3, 10, 12);
    const rows = upcomingWorkload(
      [
        card({ due: now - 5 * DAY }), // overdue
        card({ due: now }), // due now
        card({ due: now + DAY }),
        card({ due: now + DAY + 3600_000 }),
        card({ due: now + 40 * DAY }), // outside the window
      ],
      now,
      3,
    );
    expect(rows.map((r) => r.count)).toEqual([2, 2, 0]);
    expect(rows[0].day).toBe('2026-03-10');
  });
});

describe('stateMix', () => {
  it('counts cards per FSRS state', () => {
    const mix = stateMix([card({ state: 0 }), card({ state: 2 }), card({ state: 2 })]);
    expect(mix).toEqual({ 0: 1, 1: 0, 2: 2, 3: 0 });
  });
});

describe('formatDuration', () => {
  it('formats seconds, minutes and hours', () => {
    expect(formatDuration(45_000)).toBe('45s');
    expect(formatDuration(5 * 60_000)).toBe('5m');
    expect(formatDuration(95 * 60_000)).toBe('1h 35m');
  });
});
