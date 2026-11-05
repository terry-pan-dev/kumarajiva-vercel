import { describe, expect, it } from 'vitest';

import {
  buildIndexRecords,
  type IndexableParagraph,
  paragraphIndexRecord,
  settingsToChange,
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
    const set = buildIndexRecords([
      row({ id: 'a', searchId: 'same' }),
      row({ id: 'b', searchId: 'same' }),
      row({ id: 'c', searchId: null }),
      row({ id: 'd', searchId: 'sd' }),
    ]);
    expect(set.records.map((r) => r.id)).toEqual(['a', 'd']);
    expect(set.duplicateSearchId).toEqual([{ id: 'b', searchId: 'same' }]);
    expect(set.withoutSearchId).toEqual(['c']);
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
