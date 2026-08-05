import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate } from 'react-router';
import Dropzone from '../components/Dropzone';
import { deleteDeck, listDeckSummaries } from '../db/repo';

export default function DeckList() {
  const navigate = useNavigate();
  const decks = useLiveQuery(() => listDeckSummaries(), [], undefined);

  async function handleFile(name: string, text: string) {
    // Hand the file to the import screen via router state so the preview and
    // the deck-name step stay in one place.
    navigate('/import', { state: { name, text } });
  }

  if (!decks) return null;

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight">Decks</h1>
        <Link
          to="/stats"
          className="rounded-lg border border-ink-200 px-4 py-2 text-sm font-medium hover:bg-ink-100 dark:border-ink-800 dark:hover:bg-ink-900"
        >
          Progress
        </Link>
      </header>

      {decks.length === 0 ? (
        <div>
          <p className="mb-6 text-ink-600 dark:text-ink-400">
            Nothing here yet. Drop a text file to make your first deck.
          </p>
          <Dropzone onFile={handleFile} />
        </div>
      ) : (
        <>
          <ul className="mb-10 space-y-3">
            {decks.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center gap-4 rounded-xl border border-ink-200 p-5 dark:border-ink-800"
              >
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-lg font-medium">{d.name}</h2>
                  <p className="mt-0.5 text-sm text-ink-600 dark:text-ink-400">
                    {d.total} card{d.total === 1 ? '' : 's'}
                    {d.newCards > 0 && ` · ${d.newCards} new`}
                    {d.starred > 0 && ` · ★ ${d.starred}`}
                  </p>
                </div>

                <span
                  className={
                    d.due > 0
                      ? 'rounded-full bg-sky-100 px-3 py-1 text-sm font-medium text-sky-800 dark:bg-sky-950 dark:text-sky-300'
                      : 'text-sm text-ink-400'
                  }
                >
                  {d.due > 0 ? `${d.due} due` : 'nothing due'}
                </span>

                <div className="flex gap-2">
                  <Link
                    to={`/study/${d.id}`}
                    className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
                  >
                    Study
                  </Link>
                  {d.starred > 0 && (
                    <Link
                      to={`/study/${d.id}?starred=1`}
                      className="rounded-lg border border-ink-200 px-3 py-2 text-sm hover:bg-ink-100 dark:border-ink-800 dark:hover:bg-ink-900"
                      title="Study starred cards only"
                    >
                      ★ only
                    </Link>
                  )}
                  <button
                    onClick={() => {
                      if (confirm(`Delete "${d.name}" and all its cards? This can't be undone.`)) {
                        void deleteDeck(d.id);
                      }
                    }}
                    className="rounded-lg border border-ink-200 px-3 py-2 text-sm text-ink-600 hover:border-rose-400 hover:text-rose-600 dark:border-ink-800 dark:text-ink-400"
                    title="Delete deck"
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <Dropzone onFile={handleFile} compact />
        </>
      )}
    </div>
  );
}
