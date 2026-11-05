import { describe, expect, it } from 'vitest';

import {
  buildIndexRecords,
  type IndexableParagraph,
  PARAGRAPH_INDEX_SETTINGS,
  paragraphIndexRecord,
  settingsToChange,
} from '~/services/paragraph.record';

const row = (overrides: Partial<IndexableParagraph> = {}): IndexableParagraph => ({
  id: 'p1',
  searchId: 's1',
  content: '如是我聞',
  documentId: 'd1',
  sectionId: 'sec1',
  passageKey: 't0279.1.1',
  order: 1,
  ...overrides,
});

describe('paragraphIndexRecord', () => {
  it('addresses the record by search_id and carries exactly the indexed fields', () => {
    expect(paragraphIndexRecord(row())).toEqual({
      objectID: 's1',
      id: 'p1',
      content: '如是我聞',
      documentId: 'd1',
      sectionId: 'sec1',
      passageKey: 't0279.1.1',
      order: 1,
    });
  });

  // A full row has audit fields and metadata; none of them belong in the index, where they
  // could only drift from the row they were copied from.
  it('leaves out every field of a full row that the index does not hold', () => {
    const fullRow = {
      ...row(),
      metadata: { page: '14' },
      createdBy: 'u1',
      updatedBy: 'u2',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    expect(Object.keys(paragraphIndexRecord(fullRow) ?? {}).sort()).toEqual(
      ['content', 'documentId', 'id', 'objectID', 'order', 'passageKey', 'sectionId'].sort(),
    );
  });

  it('yields null for a row without a search_id, which nothing could address later', () => {
    expect(paragraphIndexRecord(row({ searchId: null }))).toBeNull();
    expect(paragraphIndexRecord(row({ searchId: '' }))).toBeNull();
  });

  it('stores a missing passage key as null, not undefined (undefined would drop the attribute)', () => {
    const record = paragraphIndexRecord({ ...row(), passageKey: undefined as unknown as null });
    expect(record).toHaveProperty('passageKey', null);
  });

  it('keeps a parked row (negative order) as it is — readers filter parked rows, not the index', () => {
    expect(paragraphIndexRecord(row({ order: -3 }))).toMatchObject({ order: -3 });
  });
});

describe('buildIndexRecords', () => {
  it('builds one record per row, in row order', () => {
    const set = buildIndexRecords([row({ id: 'a', searchId: 'sa' }), row({ id: 'b', searchId: 'sb' })]);
    expect(set.records.map((r) => r.id)).toEqual(['a', 'b']);
    expect(set.withoutSearchId).toEqual([]);
    expect(set.duplicateSearchId).toEqual([]);
  });

  it('reports rows without a search_id instead of dropping them silently', () => {
    const set = buildIndexRecords([row({ id: 'a', searchId: null }), row({ id: 'b', searchId: 'sb' })]);
    expect(set.records.map((r) => r.id)).toEqual(['b']);
    expect(set.withoutSearchId).toEqual(['a']);
  });

  // Two records with one objectID would overwrite each other in the index, so one paragraph
  // would silently vanish from search. The first is kept and the rest are reported.
  it('keeps the first of rows sharing a search_id and reports the others', () => {
    const set = buildIndexRecords([
      row({ id: 'a', searchId: 'same' }),
      row({ id: 'b', searchId: 'same' }),
      row({ id: 'c', searchId: 'same' }),
    ]);
    expect(set.records.map((r) => r.id)).toEqual(['a']);
    expect(set.duplicateSearchId).toEqual([
      { id: 'b', searchId: 'same' },
      { id: 'c', searchId: 'same' },
    ]);
  });

  it('handles no rows', () => {
    expect(buildIndexRecords([])).toEqual({ records: [], withoutSearchId: [], duplicateSearchId: [] });
  });
});

describe('PARAGRAPH_INDEX_SETTINGS', () => {
  // Pinned so a change to how search behaves is a deliberate, reviewed edit.
  it('searches only the text, keeps typo matches as a fallback, and allows "phrase" search', () => {
    expect(PARAGRAPH_INDEX_SETTINGS).toEqual({
      searchableAttributes: ['content'],
      typoTolerance: 'min',
      advancedSyntax: true,
    });
  });
});

describe('settingsToChange', () => {
  it('lists every setting of an index on Algolia defaults (nothing set)', () => {
    expect(settingsToChange({})).toEqual(['searchableAttributes', 'typoTolerance', 'advancedSyntax']);
  });

  it('lists nothing when the live settings already match', () => {
    expect(settingsToChange({ searchableAttributes: ['content'], typoTolerance: 'min', advancedSyntax: true })).toEqual(
      [],
    );
  });

  it('lists only the settings that differ', () => {
    expect(settingsToChange({ searchableAttributes: ['content'], typoTolerance: true, advancedSyntax: true })).toEqual([
      'typoTolerance',
    ]);
  });

  it('compares searchable attributes as a whole list', () => {
    expect(
      settingsToChange({ searchableAttributes: ['content', 'id'], typoTolerance: 'min', advancedSyntax: true }),
    ).toEqual(['searchableAttributes']);
  });
});
