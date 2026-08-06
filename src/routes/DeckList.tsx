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
          'flex flex-wrap items-center gap-4 rounded-xl border p-5',
          depth === 0
            ? 'border-ink-200 dark:border-ink-800'
            : 'border-transparent bg-ink-100/60 py-3 dark:bg-ink-900/60',
        ].join(' ')}
        style={depth > 0 ? { marginLeft: depth * 20 } : undefined}
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

        <div className="min-w-0 flex-1">
          <h2 className={depth === 0 ? 'truncate text-lg font-medium' : 'truncate'}>{deck.name}</h2>
          <p className="mt-0.5 text-sm text-ink-600 dark:text-ink-400">
            {counts.total} card{counts.total === 1 ? '' : 's'}
            {hasChildren && ` in ${deck.children.length} subdecks`}
            {counts.newCards > 0 && ` · ${counts.newCards} new`}
            {counts.starred > 0 && ` · ★ ${counts.starred}`}
          </p>
        </div>

        <span
          className={
            counts.due > 0
              ? 'rounded-full bg-sky-100 px-3 py-1 text-sm font-medium text-sky-800 dark:bg-sky-950 dark:text-sky-300'
              : 'text-sm text-ink-400'
          }
        >
          {counts.due > 0 ? `${counts.due} due` : 'nothing due'}
        </span>

        <div className="flex gap-2">
          <Link
            to={`/study/${deck.id}`}
            className={
              depth === 0
                ? 'rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500'
                : 'rounded-lg border border-ink-200 px-4 py-1.5 text-sm hover:bg-ink-100 dark:border-ink-800 dark:hover:bg-ink-950'
            }
          >
            Study
          </Link>
          {counts.starred > 0 && (
            <Link
              to={`/study/${deck.id}?starred=1`}
              className="rounded-lg border border-ink-200 px-3 py-2 text-sm hover:bg-ink-100 dark:border-ink-800 dark:hover:bg-ink-950"
              title="Study starred cards only"
            >
              ★ only
            </Link>
          )}
          <button
            onClick={() => onDelete(deck)}
            className="rounded-lg border border-ink-200 px-3 py-2 text-sm text-ink-600 hover:border-rose-400 hover:text-rose-600 dark:border-ink-800 dark:text-ink-400"
            title="Delete deck"
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
