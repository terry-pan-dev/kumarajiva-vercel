import { describe, expect, it } from 'vitest';

import { type ReadGlossary } from '~/drizzle/tables';
import { analyseGlossary, type GlossaryIssueCode, type IndexRecord } from '~/services/glossary.analyse';

// ─── Helpers ─────────────────────────────────────────────────────────────────

type StoredTranslation = NonNullable<ReadGlossary['translations']>[number];

function makeTranslation(overrides: Partial<StoredTranslation> & { glossary: string }): StoredTranslation {
  return {
    language: 'english',
    sutraName: '佛教常用詞',
    volume: '-',
    updatedBy: 'user-1',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeRow(overrides: Partial<ReadGlossary> & { id: string; glossary: string }): ReadGlossary {
  return {
    phonetic: null,
    subscribers: 0,
    author: null,
    cbetaFrequency: null,
    // A row with no issues by default, so each test's fixture states only what it is testing.
    translations: [makeTranslation({ glossary: 'dharma' })],
    discussion: null,
    searchId: `obj-${overrides.id}`,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
    createdBy: 'user-1',
    updatedBy: 'user-1',
    ...overrides,
  } as ReadGlossary;
}

// The healthy pairing: one record per row, carrying that row's uuid, with the objectID the
// row's search_id points at.
function recordFor(row: ReadGlossary, overrides: Partial<IndexRecord> = {}): IndexRecord {
  return { objectID: row.searchId ?? `obj-${row.id}`, id: row.id, glossary: row.glossary, ...overrides };
}

function codesFor(inspection: ReturnType<typeof analyseGlossary>, id: string): GlossaryIssueCode[] {
  return inspection.entries.find((entry) => entry.row.id === id)?.issues.map((issue) => issue.code) ?? [];
}

// ─── Clean data ──────────────────────────────────────────────────────────────

describe('analyseGlossary', () => {
  it('reports nothing for a row correctly paired with one index record', () => {
    const row = makeRow({ id: 'a', glossary: '法' });
    const inspection = analyseGlossary({ rows: [row], indexRecords: [recordFor(row)] });

    expect(inspection.entries).toEqual([]);
    expect(inspection.stats).toMatchObject({
      entries: 1,
      translations: 1,
      indexedEntries: 1,
      indexRecords: 1,
      orphanIndexRecords: 0,
      entriesWithIssues: 0,
    });
  });

  // ─── The bug that prompted the inspector ───────────────────────────────────

  it('flags a second index record carrying the same uuid', () => {
    const row = makeRow({ id: 'a', glossary: '法' });
    const stale: IndexRecord = { objectID: 'obj-from-an-earlier-import', id: row.id, glossary: row.glossary };

    const inspection = analyseGlossary({ rows: [row], indexRecords: [recordFor(row), stale] });

    expect(codesFor(inspection, 'a')).toContain('duplicate-index-record');
    // Both records belong to the row, so neither is an orphan.
    expect(inspection.stats.orphanIndexRecords).toBe(0);
    expect(inspection.entries[0].indexRecords).toHaveLength(2);
  });

  it('marks the duplicate removable and the record search_id points at canonical', () => {
    const row = makeRow({ id: 'a', glossary: '法', searchId: 'obj-a' });
    const canonical: IndexRecord = { objectID: 'obj-a', id: 'a', glossary: '法' };
    const duplicate: IndexRecord = { objectID: 'obj-duplicate', id: 'a', glossary: '法' };

    const inspection = analyseGlossary({ rows: [row], indexRecords: [canonical, duplicate] });
    const records = inspection.entries[0].indexRecords;

    expect(records.find((r) => r.objectID === 'obj-a')).toMatchObject({ canonical: true, removable: false });
    expect(records.find((r) => r.objectID === 'obj-duplicate')).toMatchObject({ canonical: false, removable: true });
    expect(inspection.stats.redundantIndexRecords).toBe(1);
    expect(inspection.removable.duplicates).toEqual(['obj-duplicate']);
  });

  it('refuses to mark anything removable when no record is canonical', () => {
    // Two records, neither of them the one search_id names: deleting either is a guess, and
    // deleting both would drop the entry out of search entirely.
    const row = makeRow({ id: 'a', glossary: '法', searchId: 'obj-missing' });
    const first: IndexRecord = { objectID: 'obj-1', id: 'a', glossary: '法' };
    const second: IndexRecord = { objectID: 'obj-2', id: 'a', glossary: '法' };

    const inspection = analyseGlossary({ rows: [row], indexRecords: [first, second] });

    expect(inspection.entries[0].indexRecords.every((record) => !record.removable)).toBe(true);
    expect(inspection.stats.redundantIndexRecords).toBe(0);
    expect(inspection.removable.duplicates).toEqual([]);
  });

  it('offers orphans for removal, including past the display cap', () => {
    const row = makeRow({ id: 'a', glossary: '法' });
    const orphans = Array.from({ length: 205 }, (_, index) => ({ objectID: `orphan-${index}`, id: 'gone' }));

    const inspection = analyseGlossary({ rows: [row], indexRecords: [recordFor(row), ...orphans] });

    expect(inspection.stats.orphanIndexRecords).toBe(205);
    expect(inspection.orphanIndexRecords).toHaveLength(200);
    expect(inspection.truncatedOrphans).toBe(true);
    // The cleanup works from the full list, not the truncated display.
    expect(inspection.removable['orphans-missing-term']).toHaveLength(205);
  });

  it('counts a record no row points at as an orphan', () => {
    const row = makeRow({ id: 'a', glossary: '法' });
    const orphan: IndexRecord = { objectID: 'obj-orphan', id: 'deleted-row-uuid', glossary: '舊' };

    const inspection = analyseGlossary({ rows: [row], indexRecords: [recordFor(row), orphan] });

    expect(inspection.stats.orphanIndexRecords).toBe(1);
    expect(inspection.orphanIndexRecords[0].objectID).toBe('obj-orphan');
    expect(inspection.entries).toEqual([]);
  });

  it('tells apart an orphan whose term survives under a new uuid from one whose term is gone', () => {
    // The live entry, re-created by an import that minted a new uuid, and the record left
    // behind by the version it replaced.
    const live = makeRow({ id: 'new-uuid', glossary: '法', searchId: 'obj-live' });
    const leftOver: IndexRecord = { objectID: 'obj-old', id: 'old-uuid', glossary: '法' };
    const vanished: IndexRecord = { objectID: 'obj-vanished', id: 'gone-uuid', glossary: '菩提' };

    const inspection = analyseGlossary({
      rows: [live],
      indexRecords: [recordFor(live), leftOver, vanished],
    });

    const orphans = inspection.orphanIndexRecords;
    expect(orphans.map((o) => o.objectID).sort()).toEqual(['obj-old', 'obj-vanished']);
    expect(orphans.find((o) => o.objectID === 'obj-old')?.liveRowWithSameTerm).toEqual({
      id: 'new-uuid',
      glossary: '法',
    });
    expect(orphans.find((o) => o.objectID === 'obj-vanished')?.liveRowWithSameTerm).toBeNull();
    expect(inspection.stats.orphansWithLiveTerm).toBe(1);
    // A record belonging to a live row is never an orphan, however many records that row has.
    expect(orphans.some((o) => o.objectID === 'obj-live')).toBe(false);
  });

  it('never counts a duplicate as an orphan, since its uuid resolves to a row', () => {
    const row = makeRow({ id: 'a', glossary: '法', searchId: 'obj-a' });
    const duplicate: IndexRecord = { objectID: 'obj-duplicate', id: 'a', glossary: '法' };

    const inspection = analyseGlossary({ rows: [row], indexRecords: [recordFor(row), duplicate] });

    expect(inspection.stats.orphanIndexRecords).toBe(0);
    expect(inspection.stats.redundantIndexRecords).toBe(1);
  });

  it('flags a search_id pointing at a record that no longer exists', () => {
    const row = makeRow({ id: 'a', glossary: '法', searchId: 'obj-gone' });

    const inspection = analyseGlossary({ rows: [row], indexRecords: [] });

    expect(codesFor(inspection, 'a')).toContain('stale-index-pointer');
  });

  it('flags a row whose record is not the one search_id points at', () => {
    const row = makeRow({ id: 'a', glossary: '法', searchId: 'obj-a' });
    const pointedAt: IndexRecord = { objectID: 'obj-a', id: 'some-other-row', glossary: '別' };
    const actual: IndexRecord = { objectID: 'obj-b', id: 'a', glossary: '法' };

    const inspection = analyseGlossary({ rows: [row], indexRecords: [pointedAt, actual] });

    expect(codesFor(inspection, 'a')).toContain('search-id-mismatch');
  });

  it('flags a row that was never indexed', () => {
    const row = makeRow({ id: 'a', glossary: '法', searchId: null });

    const inspection = analyseGlossary({ rows: [row], indexRecords: [] });

    expect(codesFor(inspection, 'a')).toEqual(['not-indexed']);
    expect(inspection.stats.indexedEntries).toBe(0);
  });

  it('skips index checks when the index was not read at all', () => {
    const row = makeRow({ id: 'a', glossary: '法', searchId: 'obj-a' });

    const inspection = analyseGlossary({ rows: [row], indexRecords: null });

    expect(codesFor(inspection, 'a')).toEqual([]);
    expect(inspection.indexChecked).toBe(false);
    expect(inspection.indexError).toBeNull();
  });

  it('skips index checks but still reports missing search_id when the index cannot be read', () => {
    const indexed = makeRow({ id: 'a', glossary: '法', searchId: 'obj-a' });
    const unindexed = makeRow({ id: 'b', glossary: '心', searchId: null });

    const inspection = analyseGlossary({
      rows: [indexed, unindexed],
      indexRecords: null,
      indexError: 'network down',
    });

    // Without index data, an empty record list must not be read as "every pointer is stale".
    expect(codesFor(inspection, 'a')).toEqual([]);
    expect(codesFor(inspection, 'b')).toEqual(['not-indexed']);
    expect(inspection.indexError).toBe('network down');
  });

  // ─── Row-level checks ──────────────────────────────────────────────────────

  it('flags two rows whose terms differ only by case, width or surrounding space', () => {
    const rows = [makeRow({ id: 'a', glossary: 'Dharma' }), makeRow({ id: 'b', glossary: ' dharma ' })];

    const inspection = analyseGlossary({ rows, indexRecords: rows.map((row) => recordFor(row)) });

    expect(codesFor(inspection, 'a')).toContain('near-duplicate-term');
    expect(codesFor(inspection, 'b')).toContain('near-duplicate-term');
    // The one with padding is also flagged for the padding itself.
    expect(codesFor(inspection, 'b')).toContain('term-has-invisible-characters');
  });

  it('flags a zero-width character hiding in a term', () => {
    const row = makeRow({ id: 'a', glossary: '法​' });

    const inspection = analyseGlossary({ rows: [row], indexRecords: [recordFor(row)] });

    expect(codesFor(inspection, 'a')).toContain('term-has-invisible-characters');
  });

  it('flags a soft-deleted row, which every glossary query still serves', () => {
    const row = makeRow({ id: 'a', glossary: '法', deletedAt: new Date('2026-02-02') });

    const inspection = analyseGlossary({ rows: [row], indexRecords: [recordFor(row)] });

    expect(codesFor(inspection, 'a')).toContain('soft-deleted');
  });

  // ─── Translation checks ────────────────────────────────────────────────────

  it('does not flag several passages from one source that share an English term', () => {
    // Legitimate data: one sutra and volume can attest the same term more than once, and the
    // importer no longer merges them, so there is nothing to warn about.
    const row = makeRow({
      id: 'a',
      glossary: '法',
      translations: [
        makeTranslation({ glossary: 'dharma', sutraName: 'Lotus', volume: '1', originSutraText: '諸法' }),
        makeTranslation({ glossary: 'dharma', sutraName: 'Lotus', volume: '1', originSutraText: '法門' }),
      ],
    });

    const inspection = analyseGlossary({ rows: [row], indexRecords: [recordFor(row)] });

    expect(codesFor(inspection, 'a')).toEqual([]);
  });

  it('keeps translations from different sources apart', () => {
    const row = makeRow({
      id: 'a',
      glossary: '法',
      translations: [
        makeTranslation({ glossary: 'dharma', sutraName: 'Lotus', volume: '1' }),
        makeTranslation({ glossary: 'dharma', sutraName: 'Diamond', volume: '1' }),
      ],
    });

    const inspection = analyseGlossary({ rows: [row], indexRecords: [recordFor(row)] });

    expect(codesFor(inspection, 'a')).toEqual([]);
  });

  it('flags empty and missing translations', () => {
    const empty = makeRow({ id: 'a', glossary: '法', translations: [] });
    const blank = makeRow({ id: 'b', glossary: '心', translations: [makeTranslation({ glossary: '  ' })] });

    const inspection = analyseGlossary({
      rows: [empty, blank],
      indexRecords: [recordFor(empty), recordFor(blank)],
    });

    expect(codesFor(inspection, 'a')).toContain('no-translations');
    expect(codesFor(inspection, 'b')).toContain('blank-translation');
    expect(inspection.stats.translations).toBe(1);
  });

  // ─── Counts ────────────────────────────────────────────────────────────────

  it('counts every issue, including those on entries beyond the reported cap', () => {
    const rows = Array.from({ length: 302 }, (_, index) =>
      makeRow({ id: `row-${index}`, glossary: `term-${index}`, translations: [] }),
    );

    const inspection = analyseGlossary({ rows, indexRecords: rows.map((row) => recordFor(row)) });

    expect(inspection.stats.entriesWithIssues).toBe(302);
    expect(inspection.stats.issueCounts['no-translations']).toBe(302);
    expect(inspection.entries).toHaveLength(300);
    expect(inspection.truncatedEntries).toBe(true);
  });
});
