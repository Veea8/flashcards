import { describe, it, expect } from 'vitest';
import type { ParsedPair } from './parseTxt';
import {
  deckNameFromFile,
  detectSource,
  groupCards,
  shortenNames,
  singleDeckName,
} from './grouping';

const card = (front: string, tags: string[] = [], deck?: string): ParsedPair => ({
  front,
  back: 'b',
  tags,
  deck,
});

describe('detectSource', () => {
  it('prefers deck names over tags when they actually divide the file', () => {
    const cards = [card('a', ['t1'], 'Deck A'), card('b', ['t2'], 'Deck B')];
    expect(detectSource(cards)).toBe('deck');
  });

  it('prefers an explicit deck name over tags', () => {
    expect(detectSource([card('a', ['t'], 'Deck A')])).toBe('deck');
  });

  it('falls back to tags', () => {
    expect(detectSource([card('a', ['t'])])).toBe('tag');
  });

  it('reports nothing to group by when neither is present', () => {
    expect(detectSource([card('a')])).toBeNull();
  });

  it('groups by tag when one #deck: line names the whole file', () => {
    // The shape of an Anki export: every card carries the same deck name, and
    // the topic tags are the only thing that separates them.
    const cards = [
      card('a', ['Topic_01'], 'Parallel Programming'),
      card('b', ['Topic_01'], 'Parallel Programming'),
      card('c', ['Topic_02'], 'Parallel Programming'),
    ];
    expect(detectSource(cards)).toBe('tag');
    expect(singleDeckName(cards)).toBe('Parallel Programming');

    const g = groupCards(cards, detectSource(cards));
    expect(g.groups.map((x) => x.name)).toEqual(['01', '02']);
    expect(g.groups[0].cards).toHaveLength(2);
  });

  it('has no single deck name when the file names several', () => {
    expect(singleDeckName([card('a', [], 'A'), card('b', [], 'B')])).toBeNull();
    expect(singleDeckName([card('a')])).toBeNull();
  });
});

describe('groupCards by tag', () => {
  const cards = [
    card('a', ['AW_Probability']),
    card('b', ['AW_Probability']),
    card('c', ['AW_Cycles']),
    card('d'), // untagged
  ];

  it('buckets by the first tag, in name order', () => {
    const g = groupCards(cards, 'tag');
    expect(g.groups.map((x) => [x.name, x.cards.length])).toEqual([
      ['Cycles', 1],
      ['Probability', 2],
    ]);
  });

  it('orders numbered topics the way the course runs, not as text', () => {
    const numbered = ['Topic_10_Late', 'Topic_2_Early', 'Topic_1_First'].map((t) => card(t, [t]));
    const g = groupCards(numbered, 'tag');
    expect(g.groups.map((x) => x.name)).toEqual(['1 First', '2 Early', '10 Late']);
  });

  it('leaves untagged cards for the parent deck', () => {
    const g = groupCards(cards, 'tag');
    expect(g.ungrouped.map((c) => c.front)).toEqual(['d']);
  });

  it('puts a multi-tag card in one group only, chosen by its first tag', () => {
    const g = groupCards([card('a', ['Alpha', 'Beta'])], 'tag');
    expect(g.groups).toHaveLength(1);
    expect(g.groups[0].key).toBe('Alpha');
    // The card keeps every tag; only its placement is singular.
    expect(g.groups[0].cards[0].tags).toEqual(['Alpha', 'Beta']);
  });

  it('returns everything ungrouped when there is no source', () => {
    const g = groupCards(cards, null);
    expect(g.groups).toHaveLength(0);
    expect(g.ungrouped).toHaveLength(4);
  });
});

describe('groupCards by deck name', () => {
  it('splits :: into a nested path', () => {
    const g = groupCards([card('a', [], 'Algorithms::Probability')], 'deck');
    expect(g.groups[0].path).toEqual(['Algorithms', 'Probability']);
    expect(g.groups[0].name).toBe('Probability');
  });

  it('does not shorten deck names', () => {
    const g = groupCards([card('a', [], 'AW_One'), card('b', [], 'AW_Two')], 'deck');
    expect(g.groups.map((x) => x.path[0]).sort()).toEqual(['AW_One', 'AW_Two']);
  });
});

describe('shortenNames', () => {
  it('strips a shared prefix that ends on a separator', () => {
    const m = shortenNames(['AW_Probability', 'AW_Graph_Basics', 'AW_Cycles']);
    expect([...m.values()]).toEqual(['Probability', 'Graph Basics', 'Cycles']);
  });

  it('leaves names alone when there is no shared prefix', () => {
    const m = shortenNames(['Alpha', 'Beta']);
    expect([...m.values()]).toEqual(['Alpha', 'Beta']);
  });

  it('does not cut a word in half', () => {
    // "Graph" is shared but is not followed by a separator in "Graphing".
    const m = shortenNames(['Graphing', 'Graphs']);
    expect([...m.values()]).toEqual(['Graphing', 'Graphs']);
  });

  it('keeps names when stripping would empty one', () => {
    const m = shortenNames(['AW_', 'AW_Cycles']);
    expect([...m.values()]).toEqual(['AW', 'AW Cycles']);
  });

  it('tidies underscores in a single name', () => {
    expect(shortenNames(['AW_Math_Basics']).get('AW_Math_Basics')).toBe('AW Math Basics');
  });
});

describe('deckNameFromFile', () => {
  it('drops the extension and tidies separators', () => {
    expect(deckNameFromFile('AW_Anki_Deck (2).txt')).toBe('AW Anki Deck (2)');
  });
});
