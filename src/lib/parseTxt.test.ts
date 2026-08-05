import { describe, it, expect } from 'vitest';
import { parseTxt } from './parseTxt';

describe('parseTxt', () => {
  it('parses a tab-separated file', () => {
    const r = parseTxt('bonjour\thello\nmerci\tthank you\n');
    expect(r.delimiterLabel).toBe('tab');
    expect(r.cards).toEqual([
      { front: 'bonjour', back: 'hello' },
      { front: 'merci', back: 'thank you' },
    ]);
    expect(r.skipped).toHaveLength(0);
  });

  it('parses a pipe-separated file', () => {
    const r = parseTxt('capital of France | Paris\ncapital of Peru | Lima');
    expect(r.delimiterLabel).toBe('|');
    expect(r.cards[0]).toEqual({ front: 'capital of France', back: 'Paris' });
  });

  it('parses semicolons', () => {
    const r = parseTxt('H2O;water\nNaCl;salt');
    expect(r.delimiterLabel).toBe(';');
    expect(r.cards).toHaveLength(2);
  });

  it('keeps commas that appear inside the answer', () => {
    const r = parseTxt('primary colours,red, yellow, blue\nsecondary,green, orange, purple');
    expect(r.delimiterLabel).toBe(',');
    expect(r.cards[0]).toEqual({ front: 'primary colours', back: 'red, yellow, blue' });
    expect(r.cards[1]).toEqual({ front: 'secondary', back: 'green, orange, purple' });
  });

  it('prefers tab over comma when both are present', () => {
    const r = parseTxt('a, b, c\tfirst three letters\nd, e, f\tnext three letters');
    expect(r.delimiterLabel).toBe('tab');
    expect(r.cards[0]).toEqual({ front: 'a, b, c', back: 'first three letters' });
  });

  it('skips junk lines instead of failing the whole import', () => {
    const r = parseTxt(
      ['good\tcard', 'this line has no delimiter at all', 'also\tfine', '\tmissing front'].join(
        '\n',
      ),
    );
    expect(r.cards).toHaveLength(2);
    expect(r.skipped).toHaveLength(2);
    expect(r.skipped[0]).toMatchObject({ line: 2, reason: 'no-delimiter' });
    expect(r.skipped[1]).toMatchObject({ line: 4, reason: 'empty-side' });
  });

  it('ignores blank lines and # comments, and reports original line numbers', () => {
    const r = parseTxt('# my deck\n\nuno\tone\n\n# section\ndos\ttwo\nbroken line here\n');
    expect(r.cards).toHaveLength(2);
    expect(r.skipped).toEqual([
      { line: 7, text: 'broken line here', reason: 'no-delimiter' },
    ]);
  });

  it('dedupes repeated fronts, keeping the first', () => {
    const r = parseTxt('cat\tgato\ncat\tel gato\ndog\tperro');
    expect(r.cards).toEqual([
      { front: 'cat', back: 'gato' },
      { front: 'dog', back: 'perro' },
    ]);
    expect(r.skipped[0]).toMatchObject({ line: 2, reason: 'duplicate' });
  });

  it('handles CRLF line endings and a BOM', () => {
    const r = parseTxt('﻿alpha\tfirst\r\nbeta\tsecond\r\n');
    expect(r.cards).toEqual([
      { front: 'alpha', back: 'first' },
      { front: 'beta', back: 'second' },
    ]);
  });

  it('turns escaped \\n inside a field into a real newline', () => {
    const r = parseTxt('water cycle\tevaporation\\ncondensation\\nprecipitation');
    expect(r.cards[0].back).toBe('evaporation\ncondensation\nprecipitation');
  });

  it('returns nothing for an empty file rather than throwing', () => {
    const r = parseTxt('');
    expect(r.cards).toHaveLength(0);
    expect(r.skipped).toHaveLength(0);
    expect(r.delimiter).toBeNull();
  });

  it('reports every line as skipped for a single-column file', () => {
    const r = parseTxt('just\nsome\nwords');
    expect(r.cards).toHaveLength(0);
    expect(r.skipped).toHaveLength(3);
    expect(r.delimiter).toBeNull();
  });
});
