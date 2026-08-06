import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router';
import { db } from '../db/db';
import { getAllLiveCards, getAllReviews, isLive } from '../db/repo';
import ChartCard from '../components/stats/ChartCard';
import Heatmap from '../components/stats/Heatmap';
import ReviewsChart from '../components/stats/ReviewsChart';
import StateDonut from '../components/stats/StateDonut';
import StatTiles from '../components/stats/StatTiles';
import UpcomingChart from '../components/stats/UpcomingChart';
import { useVizPalette } from '../lib/vizColors';
import {
  formatDuration,
  perDeck,
  retention,
  reviewsByDay,
  stateMix,
  streaks,
  today,
  upcomingWorkload,
} from '../lib/stats';

const DAY = 86_400_000;

export default function Dashboard() {
  const p = useVizPalette();

  const data = useLiveQuery(async () => {
    const [cards, reviews, decks] = await Promise.all([
      getAllLiveCards(),
      getAllReviews(),
      db.decks.toArray(),
    ]);
    return { cards, reviews, decks };
  }, []);

  if (!data) return null;

  const now = Date.now();
  const { cards, reviews, decks } = data;
  const t = today(reviews, now);
  const streak = streaks(reviews, now);
  const r30 = retention(reviews, now - 30 * DAY);
  const dueNow = cards.filter((c) => c.due <= now).length;
  const starred = cards.filter((c) => c.starred === 1).length;

  const hasHistory = reviews.length > 0;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight">Progress</h1>
        <Link
          to="/"
          className="rounded-lg border border-ink-200 px-4 py-2 text-sm font-medium hover:bg-ink-100 dark:border-ink-800 dark:hover:bg-ink-900"
        >
          Decks
        </Link>
      </header>

      {cards.length === 0 ? (
        <p className="text-ink-600 dark:text-ink-400">
          No cards yet.{' '}
          <Link to="/import" className="text-sky-600 hover:underline dark:text-sky-400">
            Import a deck
          </Link>{' '}
          to start tracking.
        </p>
      ) : (
        <div className="space-y-6">
          <StatTiles
            tiles={[
              { label: 'Due now', value: String(dueNow), hint: `${cards.length} cards total` },
              {
                label: 'Reviewed today',
                value: String(t.reviewed),
                hint: t.timeMs > 0 ? formatDuration(t.timeMs) : undefined,
              },
              {
                label: 'Streak',
                value: `${streak.current}d`,
                hint: `longest ${streak.longest}d`,
              },
              {
                label: 'Retention',
                value: r30 == null ? '—' : `${Math.round(r30 * 100)}%`,
                hint: 'last 30 days',
              },
              { label: 'Important', value: String(starred), hint: 'starred cards' },
            ]}
          />

          {!hasHistory && (
            <p className="rounded-xl border border-ink-200 bg-surface p-5 text-ink-600 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-400">
              Study your first deck to start tracking. The charts below fill in as you review.
            </p>
          )}

          {hasHistory && (
            <>
              <ChartCard
                title="Reviews per day"
                subtitle="Last 30 days"
                legend={[
                  { color: p.recalled, label: 'Recalled' },
                  { color: p.struggled, label: 'Struggled' },
                ]}
              >
                <ReviewsChart data={reviewsByDay(reviews, now, 30)} p={p} />
              </ChartCard>

              <ChartCard title="Activity" subtitle="Last 26 weeks">
                <Heatmap data={reviewsByDay(reviews, now, 182)} p={p} />
              </ChartCard>
            </>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <ChartCard title="Card states">
              <StateDonut mix={stateMix(cards)} p={p} />
            </ChartCard>

            <ChartCard title="Coming up" subtitle="Cards due over the next 14 days">
              <UpcomingChart data={upcomingWorkload(cards, now, 14)} p={p} />
            </ChartCard>
          </div>

          <section className="overflow-hidden rounded-xl border border-ink-200 bg-surface dark:border-ink-800 dark:bg-ink-900">
            <h2 className="border-b border-ink-200 px-5 py-4 font-medium dark:border-ink-800">
              By deck
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-ink-400">
                  <tr>
                    <th className="px-5 py-2 font-medium">Deck</th>
                    <th className="px-5 py-2 text-right font-medium">Cards</th>
                    <th className="px-5 py-2 text-right font-medium">Due</th>
                    <th className="px-5 py-2 text-right font-medium">★</th>
                    <th className="px-5 py-2 text-right font-medium">Retention</th>
                    <th className="px-5 py-2 text-right font-medium">Last studied</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {perDeck(decks, cards.filter(isLive), reviews, now).map((d) => (
                    <tr key={d.id} className="border-t border-ink-200 dark:border-ink-800">
                      <td className="px-5 py-2.5">
                        <Link
                          to={`/study/${d.id}`}
                          className="hover:underline"
                          style={d.depth > 0 ? { marginLeft: d.depth * 16 } : undefined}
                        >
                          {d.depth > 0 && <span className="mr-1.5 text-ink-400">└</span>}
                          {d.name}
                        </Link>
                      </td>
                      <td className="px-5 py-2.5 text-right">{d.total}</td>
                      <td className="px-5 py-2.5 text-right">{d.due}</td>
                      <td className="px-5 py-2.5 text-right">{d.starred || '—'}</td>
                      <td className="px-5 py-2.5 text-right">
                        {d.retention == null ? '—' : `${Math.round(d.retention * 100)}%`}
                      </td>
                      <td className="px-5 py-2.5 text-right text-ink-600 dark:text-ink-400">
                        {d.lastStudied ? relative(d.lastStudied, now) : 'never'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function relative(then: number, now: number): string {
  const days = Math.floor((now - then) / DAY);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return new Date(then).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
