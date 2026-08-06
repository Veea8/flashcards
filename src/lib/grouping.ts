/**
 * Turns a flat list of parsed cards into subdecks. Pure — the import screen
 * previews the result before anything is written.
 */
import type { ParsedPair } from './parseTxt';

export type GroupSource = 'deck' | 'tag' | null;

export interface Group {
  /** Stable identity: the raw deck name or tag it came from. */
  key: string;
  /** Deck path under the parent, e.g. ['Algorithms', 'Probability']. */
  path: string[];
  /** Display name (leaf of the path). */
  name: string;
  cards: ParsedPair[];
}

export interface Grouping {
  source: GroupSource;
  groups: Group[];
  /** Cards with no deck/tag of their own; they stay in the parent deck. */
  ungrouped: ParsedPair[];
}

/**
 * A card belongs to one deck: the explicit deck name if the file gave one,
 * otherwise its FIRST tag. Placing a card in several decks would schedule it
 * several times over, which is not what spaced repetition should do.
 */
function keyOf(card: ParsedPair, source: GroupSource): string | null {
  if (source === 'deck') return card.deck?.trim() || null;
  if (source === 'tag') return card.tags[0] ?? null;
  return null;
}

export function detectSource(cards: ParsedPair[]): GroupSource {
  if (cards.some((c) => c.deck?.trim())) return 'deck';
  if (cards.some((c) => c.tags.length > 0)) return 'tag';
  return null;
}

/**
 * Strips the prefix shared by every key, so `AW_Probability`, `AW_Cycles`, …
 * become `Probability`, `Cycles`. Only applies when the prefix ends on a
 * separator and no name is left empty.
 */
export function shortenNames(keys: string[]): Map<string, string> {
  const out = new Map(keys.map((k) => [k, prettify(k)]));
  if (keys.length < 2) return out;

  let prefix = keys[0];
  for (const key of keys.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < key.length && prefix[i] === key[i]) i++;
    prefix = prefix.slice(0, i);
    if (!prefix) return out;
  }

  // Cut back to the last separator so we never chop a word in half.
  const cut = Math.max(prefix.lastIndexOf('_'), prefix.lastIndexOf('-'), prefix.lastIndexOf(' '));
  if (cut < 0) return out;
  const trimmed = prefix.slice(0, cut + 1);

  const shortened = keys.map((k) => prettify(k.slice(trimmed.length)));
  if (shortened.some((s) => s === '')) return out;
  return new Map(keys.map((k, i) => [k, shortened[i]]));
}

function prettify(name: string): string {
  return name.replace(/[_-]+/g, ' ').trim();
}

export function groupCards(cards: ParsedPair[], source: GroupSource): Grouping {
  if (!source) return { source: null, groups: [], ungrouped: cards };

  const buckets = new Map<string, ParsedPair[]>();
  const ungrouped: ParsedPair[] = [];

  for (const card of cards) {
    const key = keyOf(card, source);
    if (!key) {
      ungrouped.push(card);
      continue;
    }
    const bucket = buckets.get(key);
    if (bucket) bucket.push(card);
    else buckets.set(key, [card]);
  }

  const keys = [...buckets.keys()];
  // Deck names carry their own hierarchy via `::`, so they are never shortened.
  const names = source === 'deck' ? null : shortenNames(keys);

  const groups: Group[] = keys.map((key) => {
    const path =
      source === 'deck'
        ? key
            .split('::')
            .map((s) => s.trim())
            .filter(Boolean)
        : [names!.get(key)!];
    return { key, path, name: path[path.length - 1] ?? key, cards: buckets.get(key)! };
  });

  groups.sort((a, b) => b.cards.length - a.cards.length);
  return { source, groups, ungrouped };
}

/** Deck name suggestion from the filename. */
export function deckNameFromFile(filename: string): string {
  return filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Untitled deck';
}
