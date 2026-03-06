import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExcelTranslationRow, ImportOptions } from '../file.service';

// ─── Import after mocks ───────────────────────────────────────────────────────

import { buildImportData, replaceRollData } from '../file.server';

// ─── DB mock (must be hoisted before any imports that touch ~/lib/db.server) ─

const mocks = vi.hoisted(() => {
  const txFindMany = vi.fn<() => Promise<{ id: string; parentId: string | null }[]>>().mockResolvedValue([]);
  const txDeleteWhere = vi.fn().mockResolvedValue(undefined);
  const txInsertValues = vi.fn().mockResolvedValue(undefined);
  const txDelete = vi.fn().mockReturnValue({ where: txDeleteWhere });
  const txInsert = vi.fn().mockReturnValue({ values: txInsertValues });

  const mockTx = {
    query: { paragraphsTable: { findMany: txFindMany } },
    delete: txDelete,
    insert: txInsert,
  };

  const mockTransaction = vi.fn().mockImplementation((fn: (tx: typeof mockTx) => Promise<number>) => fn(mockTx));
  const mockDb = { transaction: mockTransaction };

  return { mockDb, mockTx, txFindMany, txDeleteWhere, txInsertValues, txDelete, txInsert, mockTransaction };
});

vi.mock('~/lib/db.server', () => ({ getDb: () => mocks.mockDb }));

// paragraph.service is a transitive dep; mock it to avoid its own DB bootstrap
vi.mock('../paragraph.service', () => ({
  readParagraphsByRollIdForLanguage: vi.fn().mockResolvedValue([]),
}));

// ─── Shared fixtures ─────────────────────────────────────────────────────────

const BASE_OPTIONS: ImportOptions = {
  sutraId: 'sutra-1',
  rollId: 'roll-1',
  sutraName: 'Test Sutra',
  originalLanguage: 'chinese',
  translationLanguage: 'english',
  userId: 'user-1',
};

const TWO_ROWS: ExcelTranslationRow[] = [
  { origin: '諸法因緣生', target: 'All dharmas arise', references: [{ sutraName: 'Diamond Sutra', content: 'ref-a' }] },
  { origin: '諸法因緣滅', target: null, references: [] },
];

// ─── buildImportData ─────────────────────────────────────────────────────────

describe('buildImportData', () => {
  it('creates one origin paragraph per row', () => {
    const { originParagraphs } = buildImportData(TWO_ROWS, BASE_OPTIONS);
    expect(originParagraphs).toHaveLength(2);
  });

  it('sets sequential number and order on origin paragraphs', () => {
    const { originParagraphs } = buildImportData(TWO_ROWS, BASE_OPTIONS);
    expect(originParagraphs[0]).toMatchObject({ number: 1, order: '1' });
    expect(originParagraphs[1]).toMatchObject({ number: 2, order: '2' });
  });

  it('assigns correct content and language to origin paragraphs', () => {
    const { originParagraphs } = buildImportData(TWO_ROWS, BASE_OPTIONS);
    expect(originParagraphs[0]).toMatchObject({ content: '諸法因緣生', language: 'chinese', rollId: 'roll-1' });
  });

  it('creates target paragraphs only for rows with translations', () => {
    const { targetParagraphs } = buildImportData(TWO_ROWS, BASE_OPTIONS);
    expect(targetParagraphs).toHaveLength(1);
    expect(targetParagraphs[0].content).toBe('All dharmas arise');
  });

  it('links each target paragraph to its origin via parentId', () => {
    const { originParagraphs, targetParagraphs } = buildImportData(TWO_ROWS, BASE_OPTIONS);
    expect(targetParagraphs[0].parentId).toBe(originParagraphs[0].id);
  });

  it('assigns correct language to target paragraphs', () => {
    const { targetParagraphs } = buildImportData(TWO_ROWS, BASE_OPTIONS);
    expect(targetParagraphs[0].language).toBe('english');
  });

  it('creates reference rows only for non-empty references', () => {
    const { referencesToInsert } = buildImportData(TWO_ROWS, BASE_OPTIONS);
    expect(referencesToInsert).toHaveLength(1);
    expect(referencesToInsert[0]).toMatchObject({ sutraName: 'Diamond Sutra', content: 'ref-a' });
  });

  it('links each reference to its origin paragraph', () => {
    const { originParagraphs, referencesToInsert } = buildImportData(TWO_ROWS, BASE_OPTIONS);
    expect(referencesToInsert[0].paragraphId).toBe(originParagraphs[0].id);
  });

  it('assigns matching order to references', () => {
    const { referencesToInsert } = buildImportData(TWO_ROWS, BASE_OPTIONS);
    expect(referencesToInsert[0].order).toBe('1');
  });

  it('stamps createdBy and updatedBy from userId', () => {
    const { originParagraphs, targetParagraphs, referencesToInsert } = buildImportData(TWO_ROWS, BASE_OPTIONS);
    expect(originParagraphs[0]).toMatchObject({ createdBy: 'user-1', updatedBy: 'user-1' });
    expect(targetParagraphs[0]).toMatchObject({ createdBy: 'user-1', updatedBy: 'user-1' });
    expect(referencesToInsert[0]).toMatchObject({ createdBy: 'user-1', updatedBy: 'user-1' });
  });

  it('returns empty arrays when rows is empty', () => {
    const result = buildImportData([], BASE_OPTIONS);
    expect(result.originParagraphs).toHaveLength(0);
    expect(result.targetParagraphs).toHaveLength(0);
    expect(result.referencesToInsert).toHaveLength(0);
  });
});

// ─── replaceRollData ──────────────────────────────────────────────────────────

describe('replaceRollData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Restore default implementations after clearAllMocks wipes call history
    mocks.txFindMany.mockResolvedValue([]);
    mocks.txDeleteWhere.mockResolvedValue(undefined);
    mocks.txInsertValues.mockResolvedValue(undefined);
    mocks.txDelete.mockReturnValue({ where: mocks.txDeleteWhere });
    mocks.txInsert.mockReturnValue({ values: mocks.txInsertValues });
    mocks.mockTransaction.mockImplementation((fn: (tx: typeof mocks.mockTx) => Promise<number>) => fn(mocks.mockTx));
  });

  it('runs everything inside a transaction', async () => {
    await replaceRollData(TWO_ROWS, BASE_OPTIONS);
    expect(mocks.mockTransaction).toHaveBeenCalledOnce();
  });

  // ── With existing data ───────────────────────────────────────────────────

  describe('when existing paragraphs are present', () => {
    const existingParagraphs = [
      { id: 'orig-1', parentId: null },
      { id: 'child-1', parentId: 'orig-1' },
    ];

    beforeEach(() => {
      mocks.txFindMany.mockResolvedValue(existingParagraphs as any);
    });

    it('deletes references before paragraphs', async () => {
      await replaceRollData(TWO_ROWS, BASE_OPTIONS);
      // delete is called for: references (1st), children (2nd), parents (3rd)
      const deleteCalls = mocks.txDelete.mock.calls;
      expect(deleteCalls).toHaveLength(3);
    });

    it('inserts origins then targets then references', async () => {
      await replaceRollData(TWO_ROWS, BASE_OPTIONS);
      // insert is called for: origins (1st), targets (2nd), references (3rd)
      const insertCalls = mocks.txInsert.mock.calls;
      expect(insertCalls).toHaveLength(3);
    });

    it('returns success with correct deleted count (origin paragraphs only)', async () => {
      const result = await replaceRollData(TWO_ROWS, BASE_OPTIONS);
      expect(result.success).toBe(true);
      expect(result.deleted).toBe(1); // only the parent, not the child
    });

    it('returns inserted count equal to number of file rows', async () => {
      const result = await replaceRollData(TWO_ROWS, BASE_OPTIONS);
      expect(result.inserted).toBe(TWO_ROWS.length);
    });
  });

  // ── No existing data ─────────────────────────────────────────────────────

  describe('when no existing paragraphs', () => {
    it('skips delete calls entirely', async () => {
      await replaceRollData(TWO_ROWS, BASE_OPTIONS);
      expect(mocks.txDelete).not.toHaveBeenCalled();
    });

    it('still inserts all new rows', async () => {
      await replaceRollData(TWO_ROWS, BASE_OPTIONS);
      expect(mocks.txInsert).toHaveBeenCalled();
    });

    it('returns deleted: 0', async () => {
      const result = await replaceRollData(TWO_ROWS, BASE_OPTIONS);
      expect(result.deleted).toBe(0);
    });
  });

  // ── No translations ──────────────────────────────────────────────────────

  describe('when rows have no translations', () => {
    const originOnlyRows: ExcelTranslationRow[] = [
      { origin: '諸法因緣生', target: null, references: [] },
      { origin: '諸法因緣滅', target: null, references: [] },
    ];

    it('inserts only origin paragraphs (no target insert call)', async () => {
      await replaceRollData(originOnlyRows, BASE_OPTIONS);
      // only one insert call: origins
      expect(mocks.txInsert).toHaveBeenCalledOnce();
    });
  });

  // ── No references ────────────────────────────────────────────────────────

  describe('when rows have no references', () => {
    const noRefRows: ExcelTranslationRow[] = [{ origin: '諸法因緣生', target: 'All dharmas arise', references: [] }];

    it('inserts origins and targets but not references', async () => {
      await replaceRollData(noRefRows, BASE_OPTIONS);
      // two insert calls: origins + targets
      expect(mocks.txInsert).toHaveBeenCalledTimes(2);
    });
  });

  // ── Error handling ───────────────────────────────────────────────────────

  describe('when the transaction throws', () => {
    it('returns a failure result instead of re-throwing', async () => {
      mocks.mockTransaction.mockRejectedValueOnce(new Error('DB connection failed'));
      const result = await replaceRollData(TWO_ROWS, BASE_OPTIONS);
      expect(result.success).toBe(false);
      expect(result.message).toContain('DB connection failed');
      expect(result.errors).toHaveLength(1);
    });
  });
});
