import { describe, expect, it } from 'vitest';

import {
  contentCounts,
  duplicatePassageKeys,
  firstByPassageKey,
  isParked,
  pairByPassageKey,
  type PairableRow,
  rowProblems,
  unmatchedRows,
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

describe('isParked', () => {
  it('is true only for a negative order', () => {
    expect(isParked({ order: -1 })).toBe(true);
    expect(isParked({ order: 0 })).toBe(false);
    expect(isParked({ order: 3 })).toBe(false);
  });
});

describe('contentCounts', () => {
  it('counts each content string', () => {
    const counts = contentCounts([row('a', 1, 'k1', 'x'), row('b', 2, 'k2', 'x'), row('c', 3, 'k3', 'y')]);
    expect(Object.fromEntries(counts)).toEqual({ x: 2, y: 1 });
  });
});

describe('duplicatePassageKeys', () => {
  it('returns the keys used more than once, ignoring rows without a key', () => {
    const rows = [row('a', 1, 'k1'), row('b', 2, 'k1'), row('c', 3, 'k2'), row('d', 4, null), row('e', 5, null)];
    expect([...duplicatePassageKeys(rows)]).toEqual(['k1']);
  });
});

describe('firstByPassageKey', () => {
  it('keeps the first row of each key and skips rows without one', () => {
    const map = firstByPassageKey([row('a', 1, 'k1'), row('b', 2, 'k1'), row('c', 3, null)]);
    expect([...map.entries()].map(([k, r]) => [k, r.id])).toEqual([['k1', 'a']]);
  });
});

describe('unmatchedRows', () => {
  it('returns the other rows with no key or a key the rows lack', () => {
    const rows = [row('s1', 1, 'k1'), row('s2', 2, null)];
    const others = [row('t1', 1, 'k1'), row('t2', 2, 'k9'), row('t3', 3, null)];
    expect(unmatchedRows(rows, others).map((r) => r.id)).toEqual(['t2', 't3']);
  });
});

describe('pairByPassageKey', () => {
  it('pairs each source row with its translation by passage key, not by position', () => {
    const source = [row('s1', 1, 'k1'), row('s2', 2, 'k2')];
    const target = [row('t2', 1, 'k2'), row('t1', 2, 'k1')];
    expect(shape(pairByPassageKey(source, target))).toEqual([
      ['s1', ['t1']],
      ['s2', ['t2']],
    ]);
  });

  it('leaves an untranslated source row with no targets', () => {
    expect(shape(pairByPassageKey([row('s1', 1, 'k1')], []))).toEqual([['s1', []]]);
  });

  it('shows every translation competing for one passage, not just the first', () => {
    const pairs = pairByPassageKey([row('s1', 1, 'k1')], [row('t1', 1, 'k1'), row('t1b', 1, 'k1')]);
    expect(shape(pairs)).toEqual([['s1', ['t1', 't1b']]]);
  });

  it('keeps an orphan translation (unknown key) as its own row, placed by its order', () => {
    const source = [row('s1', 1, 'k1'), row('s3', 3, 'k3')];
    const target = [row('t1', 1, 'k1'), row('orphan', 2, 'k-gone'), row('t3', 3, 'k3')];
    expect(shape(pairByPassageKey(source, target))).toEqual([
      ['s1', ['t1']],
      [null, ['orphan']],
      ['s3', ['t3']],
    ]);
  });

  it('keeps a translation without a passage key as an orphan', () => {
    expect(shape(pairByPassageKey([row('s1', 1, 'k1')], [row('t?', 5, null)]))).toEqual([
      ['s1', []],
      [null, ['t?']],
    ]);
  });

  it('puts the source row first when an orphan shares its order', () => {
    expect(shape(pairByPassageKey([row('s1', 1, 'k1')], [row('orphan', 1, 'zz')]))).toEqual([
      ['s1', []],
      [null, ['orphan']],
    ]);
  });

  it('places parked rows (negative order) first, where the order puts them', () => {
    const pairs = pairByPassageKey([row('s1', 1, 'k1'), row('parked', -1, 'k0')], [row('tp', -1, 'k0')]);
    expect(shape(pairs)).toEqual([
      ['parked', ['tp']],
      ['s1', []],
    ]);
  });

  // A duplicate source key pairs only once, so no translation is listed twice.
  it('pairs translations with the first of two source rows sharing a key only', () => {
    const pairs = pairByPassageKey([row('s1', 1, 'k1'), row('s1dup', 2, 'k1')], [row('t1', 1, 'k1')]);
    expect(shape(pairs)).toEqual([
      ['s1', ['t1']],
      ['s1dup', []],
    ]);
  });

  it('pairs nothing with a source row that has no key', () => {
    expect(shape(pairByPassageKey([row('s1', 1, null)], [row('t1', 1, 'k1')]))).toEqual([
      ['s1', []],
      [null, ['t1']],
    ]);
  });

  it('lists every row exactly once', () => {
    const source = [row('s1', 1, 'k1'), row('s2', 2, 'k2'), row('s3', 3, null)];
    const target = [row('t1', 1, 'k1'), row('t1b', 1, 'k1'), row('t9', 9, 'k9'), row('tn', 4, null)];
    const ids = pairByPassageKey(source, target).flatMap((p) => [p.source?.id, ...p.targets.map((t) => t.id)]);
    expect(ids.filter(Boolean).sort()).toEqual(['s1', 's2', 's3', 't1', 't1b', 't9', 'tn'].sort());
  });

  it('gives each pair a unique key', () => {
    const pairs = pairByPassageKey([row('s1', 1, 'k1')], [row('orphan', 2, 'zz')]);
    expect(new Set(pairs.map((p) => p.key)).size).toBe(pairs.length);
  });
});

describe('rowProblems', () => {
  const rows = [
    row('a', 1, 'k1', 'same'),
    row('b', 2, 'k1', 'same'),
    row('c', -1, 'k2', 'unique'),
    row('d', 3, null, 'other'),
  ];
  const context = { contentCounts: contentCounts(rows), duplicateKeys: duplicatePassageKeys(rows) };

  it('flags a repeated passage key and repeated content', () => {
    expect(rowProblems(rows[0], context)).toEqual(['duplicate-passage-key', 'duplicate-content']);
  });

  it('flags a parked row', () => {
    expect(rowProblems(rows[2], context)).toEqual(['parked']);
  });

  it('flags a missing passage key', () => {
    expect(rowProblems(rows[3], context)).toEqual(['no-passage-key']);
  });

  it('finds nothing wrong with a healthy row', () => {
    const healthy = row('h', 1, 'k7', 'fine');
    expect(rowProblems(healthy, { contentCounts: contentCounts([healthy]), duplicateKeys: new Set() })).toEqual([]);
  });
});
