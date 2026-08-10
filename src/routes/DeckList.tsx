import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate } from 'react-router';
import Dropzone from '../components/Dropzone';
import { deleteDeck, listDeckTree, type DeckNode } from '../db/repo';

export default function DeckList() {
  const navigate = useNavigate();
  const decks = useLiveQuery(() => listDeckTree(), [], undefined);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  function handleFile(name: string, text: string) {
    // Hand the file to the import screen via router state so the preview and
    // the deck-name step stay in one place.
    navigate('/import', { state: { name, text } });
  }

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (!decks) return null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-6 flex items-center justify-between gap-3 sm:mb-8">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Decks</h1>
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
            {decks.map((deck) => (
              <li key={deck.id}>
                <DeckRow
                  deck={deck}
                  depth={0}
                  collapsed={collapsed}
                  onToggle={toggle}
                  onDelete={(d) => {
                    const extra = d.children.length
                      ? ` and its ${countDecks(d) - 1} subdecks`
                      : '';
                    if (confirm(`Delete "${d.name}"${extra}? This can't be undone.`)) {
                      void deleteDeck(d.id);
                    }
                  }}
                />
              </li>
            ))}
          </ul>

          <Dropzone onFile={handleFile} compact />
        </>
      )}
    </div>
  );
}

interface RowProps {
  deck: DeckNode;
  depth: number;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  onDelete: (deck: DeckNode) => void;
}

function DeckRow({ deck, depth, collapsed, onToggle, onDelete }: RowProps) {
  const isOpen = !collapsed.has(deck.id);
  const hasChildren = deck.children.length > 0;
  // A parent's numbers include everything beneath it, which is the count that
  // actually tells you how much work is waiting.
  const counts = deck.rollup;

  return (
    <>
      <div
        className={[
          'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border p-4 sm:gap-4 sm:p-5',
          depth === 0
            ? 'border-ink-200 dark:border-ink-800'
            : 'border-transparent bg-ink-100/60 py-3 dark:bg-ink-900/60',
        ].join(' ')}
        // Indentation is capped on phones so deep nesting can't squeeze the row.
        style={depth > 0 ? { marginLeft: `min(${depth * 20}px, ${depth * 4}vw)` } : undefined}
      >
        {hasChildren ? (
          <button
            onClick={() => onToggle(deck.id)}
            aria-expanded={isOpen}
            aria-label={isOpen ? 'Collapse subdecks' : 'Expand subdecks'}
            className="-my-1 shrink-0 rounded px-1 text-ink-400 hover:text-ink-600 dark:hover:text-ink-200"
          >
            {isOpen ? '▾' : '▸'}
          </button>
        ) : (
          depth > 0 && <span className="w-3 shrink-0" />
        )}

        {/* Name and due badge share the first line; actions wrap to their own. */}
        <div className="flex min-w-0 flex-1 basis-40 items-baseline gap-2">
          <h2 className={depth === 0 ? 'min-w-0 text-lg font-medium' : 'min-w-0'}>
            {/* The name opens the card list — the obvious place to look inside. */}
            <Link to={`/cards?deck=${deck.id}`} className="block truncate hover:underline">
              {deck.name}
            </Link>
          </h2>
        </div>

        <span
          className={
            counts.due > 0
              ? 'shrink-0 rounded-full bg-sky-100 px-3 py-1 text-sm font-medium text-sky-800 dark:bg-sky-950 dark:text-sky-300'
              : 'shrink-0 text-sm text-ink-400'
          }
        >
          {counts.due > 0 ? `${counts.due} due` : 'nothing due'}
        </span>

        <p className="w-full text-sm text-ink-600 sm:order-last sm:w-auto sm:basis-full dark:text-ink-400">
          <Link to={`/cards?deck=${deck.id}`} className="hover:underline">
            {counts.total} card{counts.total === 1 ? '' : 's'}
            {hasChildren && ` in ${deck.children.length} subdecks`}
            {counts.newCards > 0 && ` · ${counts.newCards} new`}
            {counts.starred > 0 && ` · ★ ${counts.starred}`}
          </Link>
        </p>

        <div className="flex w-full gap-2 sm:w-auto">
          <Link
            to={`/study/${deck.id}`}
            className={[
              'flex-1 rounded-lg px-4 py-2.5 text-center text-sm sm:flex-none sm:py-2',
              depth === 0
                ? 'bg-sky-600 font-medium text-white hover:bg-sky-500'
                : 'border border-ink-200 hover:bg-ink-100 dark:border-ink-800 dark:hover:bg-ink-950',
            ].join(' ')}
          >
            Study
          </Link>
          {counts.total > 0 && (
            <Link
              to={`/cram/${deck.id}`}
              className="flex-1 rounded-lg border border-violet-300 px-4 py-2.5 text-center text-sm text-violet-700 hover:bg-violet-50 sm:flex-none sm:py-2 dark:border-violet-900 dark:text-violet-300 dark:hover:bg-violet-950/50"
              title="Drill this deck in sets of six, ignoring due dates"
            >
              Cram
            </Link>
          )}
          {counts.starred > 0 && (
            <Link
              to={`/study/${deck.id}?starred=1`}
              className="rounded-lg border border-ink-200 px-3 py-2.5 text-sm sm:py-2 dark:border-ink-800 dark:hover:bg-ink-950"
              title="Study starred cards only"
            >
              ★ only
            </Link>
          )}
          <button
            onClick={() => onDelete(deck)}
            className="rounded-lg border border-ink-200 px-3 py-2.5 text-sm text-ink-600 hover:border-rose-400 hover:text-rose-600 sm:py-2 dark:border-ink-800 dark:text-ink-400"
            title="Delete deck"
            aria-label={`Delete ${deck.name}`}
          >
            ✕
          </button>
        </div>
      </div>

      {hasChildren && isOpen && (
        <ul className="mt-1.5 space-y-1.5">
          {deck.children.map((child) => (
            <li key={child.id}>
              <DeckRow
                deck={child}
                depth={depth + 1}
                collapsed={collapsed}
                onToggle={onToggle}
                onDelete={onDelete}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function countDecks(node: DeckNode): number {
  return 1 + node.children.reduce((sum, c) => sum + countDecks(c), 0);
}
