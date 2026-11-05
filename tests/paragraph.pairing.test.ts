import { describe, expect, it } from 'vitest';

import {
  contentCounts,
  duplicatePassageKeys,
  nextPassage,
  pairByPassageKey,
  type PairableRow,
  rowProblems,
} from '~/services/paragraph.pairing';

const row = (id: string, order: number, passageKey: string | null, content = `content of ${id}`): PairableRow => ({
  id,
  order,
  passageKey,
  content,
});

// Pairs as [source id | null, [target ids]] — easy to read in failures.
const shape = (pairs: ReturnType<typeof pairByPassageKey>) =>
  pairs.map((p) => [p.source?.id ?? null, p.targets.map((t) => t.id)]);

describe('pairByPassageKey', () => {
  it('pairs each source row with its translation by passage key, not by position', () => {
    const source = [row('s1', 1, 'k1'), row('s2', 2, 'k2')];
    const target = [row('t2', 1, 'k2'), row('t1', 2, 'k1')];
    expect(shape(pairByPassageKey(source, target))).toEqual([
      ['s1', ['t1']],
      ['s2', ['t2']],
    ]);
  });

  it('shows every translation competing for one passage, not just the first', () => {
    const pairs = pairByPassageKey([row('s1', 1, 'k1')], [row('t1', 1, 'k1'), row('t1b', 1, 'k1')]);
    expect(shape(pairs)).toEqual([['s1', ['t1', 't1b']]]);
  });

  // Orphans are the corruption this page exists to show, so they must never be dropped.
  it('keeps orphan translations (unknown or missing key) as rows of their own, placed by order', () => {
    const source = [row('s1', 1, 'k1'), row('s3', 3, 'k3')];
    const target = [row('t1', 1, 'k1'), row('orphan', 2, 'k-gone'), row('t3', 3, 'k3'), row('nokey', 4, null)];
    expect(shape(pairByPassageKey(source, target))).toEqual([
      ['s1', ['t1']],
      [null, ['orphan']],
      ['s3', ['t3']],
      [null, ['nokey']],
    ]);
  });

  it('pairs translations with only the first of two source rows sharing a key', () => {
    const pairs = pairByPassageKey([row('s1', 1, 'k1'), row('s1dup', 2, 'k1')], [row('t1', 1, 'k1')]);
    expect(shape(pairs)).toEqual([
      ['s1', ['t1']],
      ['s1dup', []],
    ]);
  });

  // The invariant behind all of the above: nothing hidden, nothing shown twice.
  it('lists every row exactly once', () => {
    const source = [row('s1', 1, 'k1'), row('s2', 2, 'k2'), row('s3', 3, null), row('s1dup', 4, 'k1')];
    const target = [row('t1', 1, 'k1'), row('t1b', 1, 'k1'), row('t9', 9, 'k9'), row('tn', 4, null)];
    const ids = pairByPassageKey(source, target).flatMap((p) => [p.source?.id, ...p.targets.map((t) => t.id)]);
    expect(ids.filter(Boolean).sort()).toEqual(['s1', 's1dup', 's2', 's3', 't1', 't1b', 't9', 'tn'].sort());
  });
});

describe('rowProblems', () => {
  const rows = [
    row('a', 1, 'k1', 'same'),
    row('b', 2, 'k1', 'same'),
    row('c', -1, 'k2', 'unique'),
    row('d', 3, null, 'other'),
    row('e', 4, 'k3', 'fine'),
  ];
  const context = { contentCounts: contentCounts(rows), duplicateKeys: duplicatePassageKeys(rows) };

  it('flags repeated keys and content, parked rows and missing keys — and nothing on a healthy row', () => {
    expect(rows.map((r) => rowProblems(r, context))).toEqual([
      ['duplicate-passage-key', 'duplicate-content'],
      ['duplicate-passage-key', 'duplicate-content'],
      ['parked'],
      ['no-passage-key'],
      [],
    ]);
  });
});

describe('nextPassage', () => {
  // After the last row of either side, so nothing is renumbered; parked rows don't count.
  it('goes after the highest order on either side, keyed as the import keys that position', () => {
    expect(nextPassage([row('a', 2, 'k'), row('b', 5, 'k'), row('p', -9, null)], 't0279', 3)).toEqual({
      order: 6,
      passageKey: 't0279.3.6',
    });
    expect(nextPassage([], 't0279', 3)).toEqual({ order: 1, passageKey: 't0279.3.1' });
  });
});
