import { looksLikeHtml } from './sanitizeHtml';

export interface ParsedPair {
  front: string;
  back: string;
  tags: string[];
}

export interface SkippedLine {
  line: number; // 1-indexed, as it appears in the file
  text: string;
  reason: 'no-delimiter' | 'empty-side' | 'duplicate';
}

export interface ParseResult {
  cards: ParsedPair[];
  skipped: SkippedLine[];
  /** The delimiter that was detected, or null if none matched. */
  delimiter: string | null;
  /** Human label for the UI, e.g. "tab" or "|". */
  delimiterLabel: string;
  /** Cards carry HTML markup that should be rendered, not printed. */
  html: boolean;
  /** 1-indexed column the tags were taken from, if any. */
  tagsColumn: number | null;
  /** Column count seen in the file (>2 means extra columns were present). */
  columns: number;
}

/**
 * Candidate delimiters, most to least trustworthy. Tab comes first because
 * that is what Anki exports use; comma comes last because prose is full of
 * commas and would otherwise win on files it shouldn't.
 */
const CANDIDATES: { value: string; label: string }[] = [
  { value: '\t', label: 'tab' },
  { value: ' | ', label: '|' },
  { value: '|', label: '|' },
  { value: ';', label: ';' },
  { value: ',', label: ',' },
];

/** A line must split cleanly this often for a delimiter to be accepted. */
const CONFIDENCE_THRESHOLD = 0.8;

/** Anki writes its export settings as `#key:value` lines at the top of the file. */
interface Directives {
  separator?: { value: string; label: string };
  html?: boolean;
  tagsColumn?: number;
}

const SEPARATOR_NAMES: Record<string, { value: string; label: string }> = {
  tab: { value: '\t', label: 'tab' },
  comma: { value: ',', label: ',' },
  semicolon: { value: ';', label: ';' },
  pipe: { value: '|', label: '|' },
  space: { value: ' ', label: 'space' },
  colon: { value: ':', label: ':' },
};

function parseDirectives(rawLines: string[]): Directives {
  const d: Directives = {};
  for (const raw of rawLines) {
    if (!raw.startsWith('#')) continue;
    const match = /^#\s*([a-z ]+)\s*:\s*(.+?)\s*$/i.exec(raw);
    if (!match) continue;
    const key = match[1].trim().toLowerCase();
    const value = match[2].trim();

    if (key === 'separator') {
      d.separator = SEPARATOR_NAMES[value.toLowerCase()] ?? { value, label: value };
    } else if (key === 'html') {
      d.html = value.toLowerCase() === 'true';
    } else if (key === 'tags column') {
      const n = Number(value);
      if (Number.isInteger(n) && n > 0) d.tagsColumn = n;
    }
  }
  return d;
}

function contentLines(text: string): { all: string[]; content: { line: number; text: string }[] } {
  const all = text
    .replace(/^﻿/, '') // strip BOM
    .replace(/\r\n?/g, '\n')
    .split('\n');

  return {
    all,
    content: all
      .map((text, i) => ({ line: i + 1, text }))
      .filter(({ text }) => text.trim() !== '' && !text.trimStart().startsWith('#')),
  };
}

function scoreDelimiter(lines: { text: string }[], delimiter: string): number {
  if (lines.length === 0) return 0;
  let ok = 0;
  for (const { text } of lines) {
    const parts = text.split(delimiter);
    if (parts.length >= 2 && parts[0].trim() !== '' && parts[1].trim() !== '') ok++;
  }
  return ok / lines.length;
}

function detectDelimiter(lines: { text: string }[]): { value: string; label: string } | null {
  let best: { value: string; label: string; score: number } | null = null;
  for (const candidate of CANDIDATES) {
    const score = scoreDelimiter(lines, candidate.value);
    if (score >= CONFIDENCE_THRESHOLD) return candidate;
    if (!best || score > best.score) best = { ...candidate, score };
  }
  // Nothing was confident. Fall back to the best scorer if it parses anything
  // at all, so a messy file still yields the cards it does contain.
  return best && best.score > 0 ? { value: best.value, label: best.label } : null;
}

/** Anki-style exports encode newlines inside a field as a literal "\n". */
function unescapeField(s: string): string {
  return s.trim().replace(/\\n/g, '\n');
}

function splitTags(field: string): string[] {
  return field
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export function parseTxt(text: string): ParseResult {
  const { all, content } = contentLines(text);
  const directives = parseDirectives(all);
  const detected = directives.separator ?? detectDelimiter(content);

  const empty: ParseResult = {
    cards: [],
    skipped: [],
    delimiter: null,
    delimiterLabel: '',
    html: false,
    tagsColumn: null,
    columns: 0,
  };

  if (!detected) {
    return {
      ...empty,
      skipped: content.map(({ line, text }) => ({ line, text, reason: 'no-delimiter' as const })),
    };
  }

  const rows = content.map(({ line, text }) => ({ line, text, parts: text.split(detected.value) }));
  const columns = Math.max(0, ...rows.map((r) => r.parts.length));

  /*
   * Where do the tags live? Anki states it outright; otherwise a tab file
   * whose every row has the same 3+ columns is that same export minus its
   * header, so the trailing column is tags rather than something to glue onto
   * the answer. The guess is restricted to TAB files on purpose — in a comma
   * file the extra "columns" are usually just commas inside the answer.
   * Either way the import preview shows what was decided.
   */
  const consistent = rows.length > 0 && rows.every((r) => r.parts.length === columns);
  const tagsColumn =
    directives.tagsColumn && directives.tagsColumn <= columns
      ? directives.tagsColumn
      : detected.value === '\t' && columns >= 3 && consistent
        ? columns
        : null;

  const cards: ParsedPair[] = [];
  const skipped: SkippedLine[] = [];
  const seenFronts = new Set<string>();

  for (const { line, text: raw, parts } of rows) {
    if (parts.length < 2) {
      skipped.push({ line, text: raw, reason: 'no-delimiter' });
      continue;
    }

    const tags = tagsColumn ? splitTags(parts[tagsColumn - 1] ?? '') : [];
    // Everything between the front and the tags column belongs to the answer,
    // so a stray extra column is never silently dropped.
    const backEnd = tagsColumn ? tagsColumn - 1 : parts.length;
    const front = unescapeField(parts[0]);
    const back = unescapeField(parts.slice(1, backEnd).join(detected.value));

    if (front === '' || back === '') {
      skipped.push({ line, text: raw, reason: 'empty-side' });
      continue;
    }

    const key = front.toLowerCase();
    if (seenFronts.has(key)) {
      skipped.push({ line, text: raw, reason: 'duplicate' });
      continue;
    }

    seenFronts.add(key);
    cards.push({ front, back, tags });
  }

  const html =
    directives.html ?? cards.some((c) => looksLikeHtml(c.front) || looksLikeHtml(c.back));

  return {
    cards,
    skipped,
    delimiter: detected.value,
    delimiterLabel: detected.label,
    html,
    tagsColumn,
    columns,
  };
}
