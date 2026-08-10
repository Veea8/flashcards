import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import Dropzone from '../components/Dropzone';
import RichText from '../components/RichText';
import { parseTxt } from '../lib/parseTxt';
import { deckNameFromFile, detectSource, groupCards, singleDeckName } from '../lib/grouping';
import { importDeckTree } from '../db/repo';

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
  const [split, setSplit] = useState(true);
  /** Group keys the user unticked; their cards fall back to the parent deck. */
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  const result = useMemo(() => (file ? parseTxt(file.text) : null), [file]);
  const grouping = useMemo(
    () => (result ? groupCards(result.cards, detectSource(result.cards)) : null),
    [result],
  );

  function handleFile(name: string, text: string) {
    setFile({ name, text });
    // A file that names its own deck knows better than the filename does.
    setDeckName(singleDeckName(parseTxt(text).cards) ?? deckNameFromFile(name));
    setShowAllSkipped(false);
    setSplit(true);
    setExcluded(new Set());
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

  const activeGroups =
    split && grouping ? grouping.groups.filter((g) => !excluded.has(g.key)) : [];

  async function save() {
    if (!result || !grouping || result.cards.length === 0) return;
    setSaving(true);

    // Anything not going into a subdeck lands in the parent deck itself.
    const inSubdecks = new Set(activeGroups.flatMap((g) => g.cards));
    const rest = result.cards.filter((c) => !inSubdecks.has(c));

    const id = await importDeckTree(
      deckName.trim() || 'Untitled deck',
      [
        ...(rest.length ? [{ path: [], cards: rest }] : []),
        ...activeGroups.map((g) => ({ path: g.path, cards: g.cards })),
      ],
      { sourceFilename: file?.name, html: result.html },
    );
    // With subdecks there's a tree worth seeing; a single deck goes straight in.
    navigate(activeGroups.length ? '/' : `/study/${id}`);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      <button
        onClick={() => navigate('/')}
        className="mb-6 text-sm text-ink-600 hover:underline dark:text-ink-400"
      >
        ← Back to decks
      </button>

      <h1 className="mb-2 text-2xl font-semibold tracking-tight sm:text-3xl">Import a deck</h1>
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
              <div className="mb-6 flex flex-wrap items-end gap-3 sm:gap-4">
                <label className="w-full sm:flex-1">
                  <span className="mb-1 block text-sm font-medium">Deck name</span>
                  <input
                    value={deckName}
                    onChange={(e) => setDeckName(e.target.value)}
                    className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2.5 outline-none focus:border-sky-500 sm:py-2 dark:border-ink-800 dark:bg-ink-900"
                  />
                </label>
                <button
                  onClick={() => void save()}
                  disabled={saving}
                  className="w-full rounded-lg bg-sky-600 px-5 py-3 font-medium text-white hover:bg-sky-500 disabled:opacity-50 sm:w-auto sm:py-2.5"
                >
                  {saving ? 'Importing…' : `Import ${result.cards.length} cards`}
                </button>
              </div>

              {grouping && grouping.groups.length > 1 && (
                <div className="mb-6 rounded-xl border border-ink-200 p-5 dark:border-ink-800">
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={split}
                      onChange={(e) => setSplit(e.target.checked)}
                      className="mt-1 size-4"
                    />
                    <span>
                      <span className="font-medium">
                        Split into {grouping.groups.length} subdecks
                      </span>
                      <span className="mt-0.5 block text-sm text-ink-600 dark:text-ink-400">
                        Grouped by {grouping.source === 'deck' ? 'deck name' : 'first tag'}, nested
                        under “{deckName || 'Untitled deck'}”. Studying the parent covers every
                        subdeck.
                      </span>
                    </span>
                  </label>

                  {split && (
                    <ul className="mt-4 space-y-1 text-sm">
                      {grouping.groups.map((g) => {
                        const on = !excluded.has(g.key);
                        return (
                          <li key={g.key}>
                            <label className="flex items-center gap-3 rounded-lg px-2 py-1 hover:bg-ink-100 dark:hover:bg-ink-950">
                              <input
                                type="checkbox"
                                checked={on}
                                onChange={() =>
                                  setExcluded((prev) => {
                                    const next = new Set(prev);
                                    if (on) next.add(g.key);
                                    else next.delete(g.key);
                                    return next;
                                  })
                                }
                                className="size-4"
                              />
                              <span className={`flex-1 ${on ? '' : 'text-ink-400 line-through'}`}>
                                {g.path.join(' › ')}
                              </span>
                              <span className="tabular-nums text-ink-600 dark:text-ink-400">
                                {g.cards.length}
                              </span>
                            </label>
                          </li>
                        );
                      })}
                      {grouping.ungrouped.length > 0 && (
                        <li className="flex items-center gap-3 px-2 py-1 text-ink-600 dark:text-ink-400">
                          <span className="size-4" />
                          <span className="flex-1 italic">
                            untagged — stays in “{deckName || 'Untitled deck'}”
                          </span>
                          <span className="tabular-nums">{grouping.ungrouped.length}</span>
                        </li>
                      )}
                    </ul>
                  )}
                </div>
              )}

              <p className="mb-3 text-sm text-ink-600 dark:text-ink-400">
                Detected <strong>{result.delimiterLabel}</strong> as the separator ·{' '}
                {result.cards.length} card{result.cards.length === 1 ? '' : 's'}
                {result.tagsColumn && ` · column ${result.tagsColumn} imported as tags`}
                {result.html && ' · formatting preserved'}
                {result.skipped.length > 0 &&
                  ` · ${result.skipped.length} line${result.skipped.length === 1 ? '' : 's'} skipped`}
              </p>

              {/*
                A list rather than a two-column table: at phone width those
                columns are ~150px each, which wraps rich answers into an
                unreadable ribbon. Stacked front-then-back reads at any size.
              */}
              <div className="overflow-hidden rounded-xl border border-ink-200 dark:border-ink-800">
                <ul className="divide-y divide-ink-200 text-sm dark:divide-ink-800">
                  {result.cards.slice(0, 10).map((c, i) => (
                    <li key={i} className="px-4 py-3">
                      <RichText text={c.front} html={result.html} className="font-medium" />
                      <div className="mt-1.5 border-l-2 border-ink-200 pl-3 text-ink-600 dark:border-ink-800 dark:text-ink-400">
                        <RichText text={c.back} html={result.html} />
                      </div>
                      {c.tags.length > 0 && (
                        <span className="mt-1.5 block text-xs text-ink-400">
                          {c.tags.join(' · ')}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
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
                <ul className="mt-2 space-y-2 rounded-xl border border-ink-200 p-4 text-sm sm:space-y-1 dark:border-ink-800">
                  {result.skipped.map((s) => (
                    <li key={s.line} className="flex flex-wrap gap-x-3 sm:flex-nowrap">
                      <span className="w-8 shrink-0 text-right text-ink-400 sm:w-10">{s.line}</span>
                      <code className="min-w-0 flex-1 truncate">{s.text || '(blank)'}</code>
                      <span className="ml-11 shrink-0 text-xs text-ink-600 sm:ml-0 sm:text-sm dark:text-ink-400">
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
