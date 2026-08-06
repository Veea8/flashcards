// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parseTxt } from './parseTxt';

/** Cards without tags, for the many cases where tags aren't the point. */
const pairs = (r: ReturnType<typeof parseTxt>) =>
  r.cards.map(({ front, back }) => ({ front, back }));

describe('parseTxt', () => {
  it('parses a tab-separated file', () => {
    const r = parseTxt('bonjour\thello\nmerci\tthank you\n');
    expect(r.delimiterLabel).toBe('tab');
    expect(pairs(r)).toEqual([
      { front: 'bonjour', back: 'hello' },
      { front: 'merci', back: 'thank you' },
    ]);
    expect(r.skipped).toHaveLength(0);
  });

  it('parses a pipe-separated file', () => {
    const r = parseTxt('capital of France | Paris\ncapital of Peru | Lima');
    expect(r.delimiterLabel).toBe('|');
    expect(pairs(r)[0]).toEqual({ front: 'capital of France', back: 'Paris' });
  });

  it('parses semicolons', () => {
    const r = parseTxt('H2O;water\nNaCl;salt');
    expect(r.delimiterLabel).toBe(';');
    expect(r.cards).toHaveLength(2);
  });

  it('keeps commas that appear inside the answer', () => {
    const r = parseTxt('primary colours,red, yellow, blue\nsecondary,green, orange, purple');
    expect(r.delimiterLabel).toBe(',');
    expect(r.tagsColumn).toBeNull(); // trailing commas are prose, not a tags column
    expect(pairs(r)[0]).toEqual({ front: 'primary colours', back: 'red, yellow, blue' });
    expect(pairs(r)[1]).toEqual({ front: 'secondary', back: 'green, orange, purple' });
  });

  it('prefers tab over comma when both are present', () => {
    const r = parseTxt('a, b, c\tfirst three letters\nd, e, f\tnext three letters');
    expect(r.delimiterLabel).toBe('tab');
    expect(pairs(r)[0]).toEqual({ front: 'a, b, c', back: 'first three letters' });
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
    expect(pairs(r)).toEqual([
      { front: 'cat', back: 'gato' },
      { front: 'dog', back: 'perro' },
    ]);
    expect(r.skipped[0]).toMatchObject({ line: 2, reason: 'duplicate' });
  });

  it('handles CRLF line endings and a BOM', () => {
    const r = parseTxt('﻿alpha\tfirst\r\nbeta\tsecond\r\n');
    expect(pairs(r)).toEqual([
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

describe('Anki exports', () => {
  const ANKI = [
    '#separator:tab',
    '#html:true',
    '#tags column:3',
    'Define: <b>disjoint</b>\tA &cap; B = &empty;<br>no shared elements.\tAW_Math_Basics',
    'Binomial <b>C(n,k)</b>\tn! / (k! &middot; (n&minus;k)!)\tAW_Math_Basics combinatorics',
  ].join('\n');

  it('honours the header directives', () => {
    const r = parseTxt(ANKI);
    expect(r.delimiterLabel).toBe('tab');
    expect(r.html).toBe(true);
    expect(r.tagsColumn).toBe(3);
    expect(r.cards).toHaveLength(2);
  });

  it('keeps the tags column out of the answer', () => {
    const r = parseTxt(ANKI);
    expect(r.cards[0].back).toBe('A &cap; B = &empty;<br>no shared elements.');
    expect(r.cards[0].back).not.toContain('AW_Math_Basics');
    expect(r.cards[0].tags).toEqual(['AW_Math_Basics']);
    expect(r.cards[1].tags).toEqual(['AW_Math_Basics', 'combinatorics']);
  });

  it('treats a consistent third tab column as tags even without the header', () => {
    const r = parseTxt('front one\tback one\ttagA\nfront two\tback two\ttagB');
    expect(r.tagsColumn).toBe(3);
    expect(r.cards[0]).toEqual({ front: 'front one', back: 'back one', tags: ['tagA'] });
  });

  it('does not steal a column when the third field is ragged', () => {
    const r = parseTxt('front one\tback one\textra\nfront two\tback two');
    expect(r.tagsColumn).toBeNull();
    expect(r.cards[0].back).toBe('back one\textra');
  });

  it('detects HTML even when the file has no #html header', () => {
    const r = parseTxt('term\tan <i>italic</i> definition');
    expect(r.html).toBe(true);
  });

  it('leaves plain files marked as plain', () => {
    expect(parseTxt('bonjour\thello').html).toBe(false);
  });

  it('reads a deck column and keeps it out of the answer', () => {
    const r = parseTxt(
      [
        '#separator:tab',
        '#deck column:3',
        '#tags column:4',
        'q1\ta1\tAlgorithms::Probability\ttagA',
        'q2\ta2\tAlgorithms::Graphs\ttagB',
      ].join('\n'),
    );
    expect(r.deckColumn).toBe(3);
    expect(r.tagsColumn).toBe(4);
    expect(r.cards[0]).toEqual({
      front: 'q1',
      back: 'a1',
      deck: 'Algorithms::Probability',
      tags: ['tagA'],
    });
  });

  it('applies a whole-file #deck name to every card', () => {
    const r = parseTxt('#separator:tab\n#deck:Discrete Maths\nq\ta');
    expect(r.cards[0].deck).toBe('Discrete Maths');
    expect(r.deckColumn).toBeNull();
  });

  it('keeps the answer intact when the deck column precedes the tags column', () => {
    const r = parseTxt('#separator:tab\n#deck column:2\n#tags column:3\nq\tDeckName\ttagA');
    // Column 2 is the deck, so there is no answer text left — the line is
    // reported rather than silently importing "DeckName" as the answer.
    expect(r.cards).toHaveLength(0);
    expect(r.skipped[0]).toMatchObject({ reason: 'empty-side' });
  });
});
