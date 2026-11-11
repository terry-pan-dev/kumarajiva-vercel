import { describe, expect, it } from 'vitest';

import {
  buildIndexRecords,
  type IndexableParagraph,
  paragraphIndexRecord,
  recordBytes,
  settingsToChange,
  splitOversized,
} from '~/services/paragraph.record';

const row = (overrides: Partial<IndexableParagraph> = {}): IndexableParagraph => ({
  id: 'p1',
  searchId: 's1',
  content: '如是我聞',
  ...overrides,
});

describe('paragraphIndexRecord', () => {
  // Every write path hands this a full row; anything else copied into the index can only drift
  // from the row it came from.
  it('addresses the record by search_id and copies nothing but id and content', () => {
    const fullRow = {
      ...row(),
      documentId: 'd1',
      sectionId: 'sec1',
      passageKey: 't0279.1.1',
      order: 1,
      metadata: { page: '14' },
      createdBy: 'u1',
      updatedBy: 'u2',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    expect(paragraphIndexRecord(fullRow)).toEqual({ objectID: 's1', id: 'p1', content: '如是我聞' });
  });

  it('yields null for a row without a search_id, which nothing could address later', () => {
    expect(paragraphIndexRecord(row({ searchId: null }))).toBeNull();
    expect(paragraphIndexRecord(row({ searchId: '' }))).toBeNull();
  });
});

describe('buildIndexRecords', () => {
  // Two records with one objectID overwrite each other, so a paragraph would silently vanish
  // from search. The first is kept and the rest are reported, as are rows with no search_id.
  it('keeps the first of rows sharing a search_id and reports the rest, and rows without one', () => {
    const set = buildIndexRecords(
      [
        row({ id: 'a', searchId: 'same' }),
        row({ id: 'b', searchId: 'same' }),
        row({ id: 'c', searchId: null }),
        row({ id: 'd', searchId: 'sd' }),
      ],
      10_000,
    );
    expect(set.records.map((r) => r.id)).toEqual(['a', 'd']);
    expect(set.duplicateSearchId).toEqual([{ id: 'b', searchId: 'same' }]);
    expect(set.withoutSearchId).toEqual(['c']);
    expect(set.tooBig).toEqual([]);
  });

  // Algolia would reject the record, and the whole batch with it.
  it('leaves out rows whose record is over the limit, reporting them with their passage key', () => {
    const long = { ...row({ id: 'long', searchId: 'sl', content: 'x'.repeat(200) }), passageKey: 'k.9' };
    const set = buildIndexRecords([row({ id: 'short' }), long], 100);
    expect(set.records.map((r) => r.id)).toEqual(['short']);
    expect(set.tooBig).toEqual([
      { id: 'long', searchId: 'sl', bytes: recordBytes(paragraphIndexRecord(long)!), passageKey: 'k.9' },
    ]);
  });
});

describe('recordBytes / splitOversized', () => {
  // Algolia counts bytes, not characters: a CJK character is three bytes of UTF-8.
  it('measures the JSON in UTF-8 bytes', () => {
    const record = { objectID: 's', id: 'p', content: '如是' };
    expect(recordBytes(record)).toBe(JSON.stringify(record).length + 4);
  });

  it('keeps records up to the limit and returns the rest', () => {
    const small = { objectID: 's1', id: 'p1', content: 'a' };
    const big = { objectID: 's2', id: 'p2', content: 'a'.repeat(50) };
    const { records, tooBig } = splitOversized([small, big], recordBytes(small));
    expect(records).toEqual([small]);
    expect(tooBig).toEqual([{ id: 'p2', searchId: 's2', bytes: recordBytes(big) }]);
  });
});

describe('settingsToChange', () => {
  it('counts unset settings as different, since Algolia defaults are not what we want', () => {
    expect(settingsToChange({})).toEqual(['searchableAttributes', 'typoTolerance', 'advancedSyntax']);
  });

  it('lists only the settings that differ, comparing lists as a whole', () => {
    expect(settingsToChange({ searchableAttributes: ['content'], typoTolerance: 'min', advancedSyntax: true })).toEqual(
      [],
    );
    expect(
      settingsToChange({ searchableAttributes: ['content', 'id'], typoTolerance: true, advancedSyntax: true }),
    ).toEqual(['searchableAttributes', 'typoTolerance']);
  });
});
