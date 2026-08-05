import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import Dropzone from '../components/Dropzone';
import { parseTxt } from '../lib/parseTxt';
import { createDeckFromCards } from '../db/repo';

const SKIP_REASONS: Record<string, string> = {
  'no-delimiter': 'no separator found',
  'empty-side': 'front or back was empty',
  duplicate: 'duplicate of an earlier card',
};

export default function Import() {
  const navigate = useNavigate();
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [deckName, setDeckName] = useState('');
  const [saving, setSaving] = useState(false);
  const [showAllSkipped, setShowAllSkipped] = useState(false);

  const result = useMemo(() => (file ? parseTxt(file.text) : null), [file]);

  function handleFile(name: string, text: string) {
    setFile({ name, text });
    setDeckName(name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '));
    setShowAllSkipped(false);
  }

  // A file dropped on the deck list arrives here via router state.
  const location = useLocation();
  const consumed = useRef(false);
  useEffect(() => {
    const dropped = location.state as { name: string; text: string } | null;
    if (dropped?.text && !consumed.current) {
      consumed.current = true;
      handleFile(dropped.name, dropped.text);
    }
  }, [location.state]);

  async function save() {
    if (!result || result.cards.length === 0) return;
    setSaving(true);
    const id = await createDeckFromCards(
      deckName.trim() || 'Untitled deck',
      result.cards,
      file?.name,
    );
    navigate(`/study/${id}`);
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <button
        onClick={() => navigate('/')}
        className="mb-6 text-sm text-ink-600 hover:underline dark:text-ink-400"
      >
        ← Back to decks
      </button>

      <h1 className="mb-2 text-3xl font-semibold tracking-tight">Import a deck</h1>
      <p className="mb-8 text-ink-600 dark:text-ink-400">
        One card per line. Separate front from back with a tab, <code>|</code>, <code>;</code> or a
        comma — it's detected automatically. Lines starting with <code>#</code> are ignored.
      </p>

      <Dropzone onFile={handleFile} compact={!!file} />

      {result && (
        <div className="mt-8">
          {result.cards.length === 0 ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950/40">
              <p className="font-medium">No cards found in {file?.name}.</p>
              <p className="mt-1 text-sm text-ink-600 dark:text-ink-400">
                Every line needs a separator between the front and the back, like
                <code className="mx-1">bonjour | hello</code>. Found {result.skipped.length}{' '}
                unusable line{result.skipped.length === 1 ? '' : 's'}.
              </p>
            </div>
          ) : (
            <>
              <div className="mb-6 flex flex-wrap items-end gap-4">
                <label className="flex-1">
                  <span className="mb-1 block text-sm font-medium">Deck name</span>
                  <input
                    value={deckName}
                    onChange={(e) => setDeckName(e.target.value)}
                    className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 outline-none focus:border-sky-500 dark:border-ink-800 dark:bg-ink-900"
                  />
                </label>
                <button
                  onClick={() => void save()}
                  disabled={saving}
                  className="rounded-lg bg-sky-600 px-5 py-2.5 font-medium text-white hover:bg-sky-500 disabled:opacity-50"
                >
                  {saving ? 'Importing…' : `Import ${result.cards.length} cards`}
                </button>
              </div>

              <p className="mb-3 text-sm text-ink-600 dark:text-ink-400">
                Detected <strong>{result.delimiterLabel}</strong> as the separator ·{' '}
                {result.cards.length} card{result.cards.length === 1 ? '' : 's'}
                {result.skipped.length > 0 &&
                  ` · ${result.skipped.length} line${result.skipped.length === 1 ? '' : 's'} skipped`}
              </p>

              <div className="overflow-hidden rounded-xl border border-ink-200 dark:border-ink-800">
                <table className="w-full text-left text-sm">
                  <thead className="bg-ink-100 text-xs uppercase tracking-wide text-ink-600 dark:bg-ink-900 dark:text-ink-400">
                    <tr>
                      <th className="px-4 py-2 font-medium">Front</th>
                      <th className="px-4 py-2 font-medium">Back</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.cards.slice(0, 10).map((c, i) => (
                      <tr key={i} className="border-t border-ink-200 dark:border-ink-800">
                        <td className="px-4 py-2 whitespace-pre-wrap">{c.front}</td>
                        <td className="px-4 py-2 whitespace-pre-wrap">{c.back}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {result.cards.length > 10 && (
                  <p className="border-t border-ink-200 px-4 py-2 text-xs text-ink-600 dark:border-ink-800 dark:text-ink-400">
                    + {result.cards.length - 10} more
                  </p>
                )}
              </div>
            </>
          )}

          {result.skipped.length > 0 && (
            <div className="mt-6">
              <button
                onClick={() => setShowAllSkipped((v) => !v)}
                className="text-sm text-ink-600 hover:underline dark:text-ink-400"
              >
                {showAllSkipped ? 'Hide' : 'Show'} {result.skipped.length} skipped line
                {result.skipped.length === 1 ? '' : 's'}
              </button>
              {showAllSkipped && (
                <ul className="mt-2 space-y-1 rounded-xl border border-ink-200 p-4 text-sm dark:border-ink-800">
                  {result.skipped.map((s) => (
                    <li key={s.line} className="flex gap-3">
                      <span className="w-10 shrink-0 text-right text-ink-400">{s.line}</span>
                      <code className="min-w-0 flex-1 truncate">{s.text || '(blank)'}</code>
                      <span className="shrink-0 text-ink-600 dark:text-ink-400">
                        {SKIP_REASONS[s.reason]}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
