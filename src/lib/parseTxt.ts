export interface ParsedPair {
  front: string;
  back: string;
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

function contentLines(text: string): { line: number; text: string }[] {
  return text
    .replace(/^﻿/, '') // strip BOM
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((text, i) => ({ line: i + 1, text }))
    .filter(({ text }) => text.trim() !== '' && !text.trimStart().startsWith('#'));
}

/** Split on the FIRST occurrence only, so delimiters inside the answer survive. */
function splitOnce(line: string, delimiter: string): [string, string] | null {
  const at = line.indexOf(delimiter);
  if (at === -1) return null;
  return [line.slice(0, at), line.slice(at + delimiter.length)];
}

function scoreDelimiter(lines: { text: string }[], delimiter: string): number {
  if (lines.length === 0) return 0;
  let ok = 0;
  for (const { text } of lines) {
    const parts = splitOnce(text, delimiter);
    if (parts && parts[0].trim() !== '' && parts[1].trim() !== '') ok++;
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

export function parseTxt(text: string): ParseResult {
  const lines = contentLines(text);
  const detected = detectDelimiter(lines);

  if (!detected) {
    return {
      cards: [],
      skipped: lines.map(({ line, text }) => ({ line, text, reason: 'no-delimiter' as const })),
      delimiter: null,
      delimiterLabel: '',
    };
  }

  const cards: ParsedPair[] = [];
  const skipped: SkippedLine[] = [];
  const seenFronts = new Set<string>();

  for (const { line, text: raw } of lines) {
    const parts = splitOnce(raw, detected.value);
    if (!parts) {
      skipped.push({ line, text: raw, reason: 'no-delimiter' });
      continue;
    }

    const front = unescapeField(parts[0]);
    const back = unescapeField(parts[1]);
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
    cards.push({ front, back });
  }

  return { cards, skipped, delimiter: detected.value, delimiterLabel: detected.label };
}
