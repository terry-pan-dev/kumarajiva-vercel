import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  appendPassage,
  getSectionParagraphCounts,
  insertParagraph,
  readParagraphsByDocumentId,
  nextSectionOrder,
  readParagraphsBySectionId,
  reorderProjectSections,
  sectionOrderMoves,
  type ReferenceDocument,
  updateParagraph,
} from '~/services/text.service';

// The paragraph queries are mocked; what's under test is how the service pairs
// and orders what they return.
const mocks = vi.hoisted(() => ({
  findBySectionId: vi.fn(),
  findByDocumentId: vi.fn(),
  findByDocumentIdAndPassageKeys: vi.fn(),
  countBySectionForDocument: vi.fn(),
  findById: vi.fn(),
  updateById: vi.fn(),
  create: vi.fn(),
  createMany: vi.fn(),
  findAllBySectionIdForDebug: vi.fn(),
}));
const searchMocks = vi.hoisted(() => ({
  indexParagraphs: vi.fn().mockResolvedValue([]),
  deleteParagraphsFromAlgolia: vi.fn(),
  maxRecordBytes: () => 10000,
}));
const sectionMocks = vi.hoisted(() => ({ findByDocumentId: vi.fn(), updateOrders: vi.fn() }));
const projectMocks = vi.hoisted(() => ({
  DbProjects: { findByIds: vi.fn(), findByDocumentId: vi.fn() },
  DbProjectReferences: { findByProjectId: vi.fn() },
}));

vi.mock('~/lib/db.server', () => ({ getDb: () => ({}) }));
vi.mock('~/services/search.server', () => searchMocks);
vi.mock('~/services/text.crud', () => ({
  DbParagraphsNew: mocks,
  DbContributors: {},
  DbDocuments: {},
  DbSections: sectionMocks,
  DbWorks: {},
}));
vi.mock('~/services/project.crud', () => projectMocks);

// ─── Fixtures ────────────────────────────────────────────────────────────────

const row = (id: string, documentId: string, passageKey: string | null, content: string, extra = {}) => ({
  id,
  documentId,
  sectionId: 's1',
  order: 1,
  passageKey,
  content,
  searchId: null,
  ...extra,
});

// Paragraphs of each document, by passage key.
const documents: Record<string, ReturnType<typeof row>[]> = {
  target: [
    row('t1', 'target', 'k1', 'Thus I have heard', { metadata: { page: '3' } }),
    row('t2', 'target', 'k2', 'At one time'),
  ],
  refA: [row('a1', 'refA', 'k1', 'Thus have I heard', { metadata: { page: '201' } })],
  refB: [row('b2', 'refB', 'k2', 'Once')],
};

const references: ReferenceDocument[] = [
  { documentId: 'refA', document: { key: 'btts', title: 'BTTS rendering', contributors: [{ name: 'BTTS' }] } },
  { documentId: 'refB', document: { key: null, title: 'Commentary' } },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findByDocumentIdAndPassageKeys.mockImplementation(async (documentId: string, keys: string[]) =>
    (documents[documentId] ?? []).filter((p) => keys.includes(p.passageKey!)),
  );
});

// ─── readParagraphsBySectionId ───────────────────────────────────────────────

describe('readParagraphsBySectionId', () => {
  beforeEach(() => {
    mocks.findBySectionId.mockResolvedValue([
      row('s1', 'source', 'k1', '如是我聞'),
      row('s2', 'source', 'k2', '一時'),
      row('s3', 'source', null, '（無鍵）'),
    ]);
  });

  it('pairs the translation and each reference by passage key, in the order given', async () => {
    const [first, second, unkeyed] = await readParagraphsBySectionId({
      sectionId: 'sec',
      targetDocumentId: 'target',
      references,
    });

    expect(first).toMatchObject({
      origin: '如是我聞',
      target: 'Thus I have heard',
      targetId: 't1',
      targetMetadata: { page: '3' },
    });
    expect(first.references).toEqual([
      {
        documentId: 'refA',
        key: 'btts',
        title: 'BTTS rendering',
        contributors: ['BTTS'],
        content: 'Thus have I heard',
        metadata: { page: '201' },
      },
      // Contributors are optional on the input; none loaded means none shown.
      { documentId: 'refB', key: null, title: 'Commentary', contributors: [], content: null, metadata: null },
    ]);
    expect(second.targetMetadata).toBeNull();
    expect(second.references.map((r) => r.content)).toEqual([null, 'Once']);
    // Without a passage key nothing can be paired.
    expect(unkeyed).toMatchObject({ target: null });
    expect(unkeyed.references.map((r) => r.content)).toEqual([null, null]);
  });

  it('returns no references when none are asked for', async () => {
    const paragraphs = await readParagraphsBySectionId({ sectionId: 'sec', targetDocumentId: 'target' });

    expect(paragraphs.every((p) => p.references.length === 0)).toBe(true);
    expect(mocks.findByDocumentIdAndPassageKeys).toHaveBeenCalledTimes(1);
  });
});

// ─── readParagraphsByDocumentId ──────────────────────────────────────────────

describe('readParagraphsByDocumentId', () => {
  const inSection = (id: string, sectionOrder: number, order: number) =>
    row(id, 'source', null, id, { order, section: { order: sectionOrder } });

  beforeEach(() => {
    // As the query returns them: by paragraph order only, sections interleaved.
    mocks.findByDocumentId.mockResolvedValue([
      inSection('2.1', 2, 1),
      inSection('1.1', 1, 1),
      inSection('2.2', 2, 2),
      inSection('1.2', 1, 2),
    ]);
  });

  it('returns the document in reading order: by section, then paragraph', async () => {
    const paragraphs = await readParagraphsByDocumentId({ documentId: 'source' });

    expect(paragraphs.map((p) => p.id)).toEqual(['1.1', '1.2', '2.1', '2.2']);
    expect(paragraphs[0]).not.toHaveProperty('section');
  });

  it('applies the limit after ordering', async () => {
    const paragraphs = await readParagraphsByDocumentId({ documentId: 'source', limit: 3 });

    expect(paragraphs.map((p) => p.id)).toEqual(['1.1', '1.2', '2.1']);
  });
});

// ─── getSectionParagraphCounts ───────────────────────────────────────────────

describe('getSectionParagraphCounts', () => {
  it('maps each section to its paragraph count', async () => {
    mocks.countBySectionForDocument.mockResolvedValue([
      { sectionId: 'a', count: 3 },
      { sectionId: 'b', count: 5 },
    ]);

    expect(await getSectionParagraphCounts('doc')).toEqual(
      new Map([
        ['a', 3],
        ['b', 5],
      ]),
    );
  });
});

// ─── Section order ───────────────────────────────────────────────────────────

const sections = (documentId: string, orders: number[]) =>
  orders.map((order) => ({ id: `${documentId}-${order}`, documentId, order, title: `${documentId} ${order}` }));

describe('sectionOrderMoves', () => {
  const source = sections('src', [1, 2, 3, 4]);

  it('maps the old order of each moved section to its new one', () => {
    expect(sectionOrderMoves(source, ['src-1', 'src-4', 'src-2', 'src-3'])).toEqual(
      new Map([
        [4, 2],
        [2, 3],
        [3, 4],
      ]),
    );
  });

  it('moves nothing when the order is unchanged', () => {
    expect(sectionOrderMoves(source, ['src-1', 'src-2', 'src-3', 'src-4']).size).toBe(0);
  });

  it('reuses the order numbers the sections already have, gaps included', () => {
    const gapped = sections('src', [1, 5, 9]);
    expect(sectionOrderMoves(gapped, ['src-9', 'src-1', 'src-5'])).toEqual(
      new Map([
        [9, 1],
        [1, 5],
        [5, 9],
      ]),
    );
  });

  it('refuses a list that no longer matches the sections', () => {
    expect(() => sectionOrderMoves(source, ['src-1', 'src-2', 'src-3'])).toThrow(/Reload the page/);
    expect(() => sectionOrderMoves(source, ['src-1', 'src-2', 'src-3', 'other'])).toThrow(/Reload the page/);
    expect(() => sectionOrderMoves(source, ['src-1', 'src-1', 'src-2', 'src-3'])).toThrow(/Reload the page/);
  });
});

describe('reorderProjectSections', () => {
  const user = { id: 'u1' } as Parameters<typeof reorderProjectSections>[1];
  const byDocument: Record<string, ReturnType<typeof sections>> = {
    src: sections('src', [1, 2, 3]),
    tgt: sections('tgt', [1, 2, 3, 4]),
    refA: sections('refA', [1, 3]),
    tgt2: sections('tgt2', [1, 2]),
  };
  const p1 = { id: 'p1', sourceDocumentId: 'src', targetDocumentId: 'tgt' };

  beforeEach(() => {
    projectMocks.DbProjects.findByIds.mockImplementation(async (ids: string[]) => (ids[0] === 'p1' ? [p1] : []));
    // findByDocumentId also returns projects whose *target* is the document.
    projectMocks.DbProjects.findByDocumentId.mockResolvedValue([
      p1,
      { id: 'other', sourceDocumentId: 'elsewhere', targetDocumentId: 'src' },
    ]);
    projectMocks.DbProjectReferences.findByProjectId.mockImplementation(async (id: string) =>
      id === 'p1' ? [{ documentId: 'refA' }] : [],
    );
    sectionMocks.findByDocumentId.mockImplementation(async (documentId: string) => byDocument[documentId] ?? []);
  });

  it('moves the translation and reference counterparts with the source sections, in one update', async () => {
    // Section 3 moves to the front.
    await reorderProjectSections({ projectId: 'p1', sectionIds: ['src-3', 'src-1', 'src-2'] }, user);

    expect(sectionMocks.updateOrders).toHaveBeenCalledTimes(1);
    const [updates, updatedBy] = sectionMocks.updateOrders.mock.calls[0];
    expect(updatedBy).toBe('u1');
    expect(Object.fromEntries(updates.map((u: { id: string; order: number }) => [u.id, u.order]))).toEqual({
      'src-3': 1,
      'src-1': 2,
      'src-2': 3,
      'tgt-3': 1,
      'tgt-1': 2,
      'tgt-2': 3,
      'refA-3': 1,
      'refA-1': 2,
    });
  });

  it('also moves the sections of other projects on the same source document', async () => {
    projectMocks.DbProjects.findByDocumentId.mockResolvedValue([
      p1,
      { id: 'p2', sourceDocumentId: 'src', targetDocumentId: 'tgt2' },
    ]);
    await reorderProjectSections({ projectId: 'p1', sectionIds: ['src-2', 'src-1', 'src-3'] }, user);

    const updates = sectionMocks.updateOrders.mock.calls[0][0];
    expect(updates).toEqual(
      expect.arrayContaining([
        { id: 'tgt2-2', order: 1 },
        { id: 'tgt2-1', order: 2 },
      ]),
    );
  });

  it('leaves sections without a source counterpart where they are', async () => {
    await reorderProjectSections({ projectId: 'p1', sectionIds: ['src-3', 'src-1', 'src-2'] }, user);

    const ids = sectionMocks.updateOrders.mock.calls[0][0].map((u: { id: string }) => u.id);
    expect(ids).not.toContain('tgt-4');
  });

  it('changes nothing when the page’s list is out of date', async () => {
    await expect(reorderProjectSections({ projectId: 'p1', sectionIds: ['src-3', 'src-1'] }, user)).rejects.toThrow(
      /Reload the page/,
    );
    expect(sectionMocks.updateOrders).not.toHaveBeenCalled();
  });

  it('fails for an unknown project', async () => {
    projectMocks.DbProjects.findByIds.mockResolvedValue([]);
    await expect(reorderProjectSections({ projectId: 'nope', sectionIds: [] }, user)).rejects.toThrow(
      'Project not found',
    );
  });
});

describe('nextSectionOrder', () => {
  const byDocument: Record<string, ReturnType<typeof sections>> = {
    // Section 2 was deleted: two sections, but order 3 is taken.
    src: sections('src', [1, 3]),
    tgt: sections('tgt', [1, 3]),
    // A reference section with no source section yet.
    refA: sections('refA', [1, 3, 5]),
    tgt2: sections('tgt2', [1, 4]),
    newRef: sections('newRef', [7]),
  };

  beforeEach(() => {
    projectMocks.DbProjects.findByDocumentId.mockResolvedValue([
      { id: 'p1', sourceDocumentId: 'src', targetDocumentId: 'tgt' },
      { id: 'other', sourceDocumentId: 'elsewhere', targetDocumentId: 'src' },
    ]);
    projectMocks.DbProjectReferences.findByProjectId.mockImplementation(async (id: string) =>
      id === 'p1' ? [{ documentId: 'refA' }] : [],
    );
    sectionMocks.findByDocumentId.mockImplementation(async (documentId: string) => byDocument[documentId] ?? []);
  });

  it('goes past the highest order of the source and its paired documents, not the section count', async () => {
    expect(await nextSectionOrder('src')).toBe(6);
  });

  it('ignores projects where the document is the translation, not the source', async () => {
    await nextSectionOrder('src');
    expect(sectionMocks.findByDocumentId).not.toHaveBeenCalledWith('elsewhere');
  });

  it('includes other projects on the same source, and the documents the new section goes into', async () => {
    projectMocks.DbProjects.findByDocumentId.mockResolvedValue([
      { id: 'p1', sourceDocumentId: 'src', targetDocumentId: 'tgt' },
      { id: 'p2', sourceDocumentId: 'src', targetDocumentId: 'tgt2' },
    ]);
    expect(await nextSectionOrder('src')).toBe(6);
    expect(await nextSectionOrder('src', ['newRef'])).toBe(8);
  });

  it('is 1 for a document without sections', async () => {
    projectMocks.DbProjects.findByDocumentId.mockResolvedValue([]);
    expect(await nextSectionOrder('empty')).toBe(1);
  });
});

// ─── Editor writes → search index ────────────────────────────────────────────
// The editor saves the whole search record of the row it writes, built from the stored row with
// the change applied, so the record also comes back if it had gone missing.

describe('updateParagraph', () => {
  const stored = row('t1', 'target', 'k1', 'Thus I have heard', { searchId: 'st1', order: 4, metadata: { page: '3' } });

  beforeEach(() => {
    mocks.findById.mockResolvedValue(stored);
  });

  // The record must carry the stored search_id, or the save would create a second record.
  it('indexes the stored row with the new content, under its existing search_id', async () => {
    await updateParagraph({ id: 't1', newContent: 'Thus have I heard', updatedBy: 'u2' });
    expect(searchMocks.indexParagraphs.mock.calls).toEqual([
      [[expect.objectContaining({ id: 't1', searchId: 'st1', content: 'Thus have I heard' })]],
    ]);
  });
});

describe('insertParagraph', () => {
  const source = row('s7', 'source', 'k7', '一時', { order: 7 });

  beforeEach(() => {
    mocks.findById.mockResolvedValue(source);
  });

  const insert = () =>
    insertParagraph({
      sourceId: 's7',
      documentId: 'target',
      sectionId: 'ts1',
      newParagraph: { content: 'At one time', createdBy: 'u1', updatedBy: 'u1' },
    });

  // The passage key is what pairs the translation with its source everywhere else.
  it("creates the translation at the source's order and passage key, and indexes that row", async () => {
    await insert();
    const created = mocks.create.mock.calls[0][0];
    expect(created).toMatchObject({ documentId: 'target', sectionId: 'ts1', order: 7, passageKey: 'k7' });
    expect(created.searchId).toEqual(expect.any(String));
    expect(searchMocks.indexParagraphs).toHaveBeenCalledWith([created]);
  });
});

// ─── appendPassage ───────────────────────────────────────────────────────────

describe('appendPassage', () => {
  const context = {
    projectId: 'p1',
    passageKeyPrefix: 't0279',
    origin: {
      document: { id: 'src', key: 'chinese', title: 'Chinese', language: 'chinese' as const },
      section: { id: 'ss', title: '卷一', order: 3 },
    },
    target: {
      document: { id: 'tgt', key: 'english', title: 'English', language: 'english' as const },
      section: { id: 'ts', title: 'Roll 1', order: 3 } as { id: string; title: string; order: number } | null,
    },
    references: [],
  };
  const noTarget = { ...context, target: { ...context.target, section: null } };

  beforeEach(() => {
    // Source rows up to order 2 (plus a parked one); the translation side runs one further.
    mocks.findAllBySectionIdForDebug.mockImplementation(async (sectionId: string) =>
      sectionId === 'ss'
        ? [
            row('s1', 'src', 't0279.3.1', 'a'),
            row('s2', 'src', 't0279.3.2', 'b', { order: 2 }),
            row('sp', 'src', null, 'x', { order: -9 }),
          ]
        : [row('t3', 'tgt', 'x.extra', 'c', { order: 3 })],
    );
    mocks.findByDocumentIdAndPassageKeys.mockResolvedValue([]);
  });

  // The key pairs the two rows everywhere else, and the order must come after both sides so
  // nothing is renumbered.
  it('adds source and translation after the last row of either side, under one new key, and indexes both', async () => {
    const result = await appendPassage({
      context,
      source: ' 如是我聞 ',
      translation: 'Thus I have heard',
      userId: 'u1',
    });
    const created = mocks.createMany.mock.calls[0][0];
    expect(created).toEqual([
      expect.objectContaining({
        documentId: 'src',
        sectionId: 'ss',
        order: 4,
        passageKey: 't0279.3.4',
        content: '如是我聞',
      }),
      expect.objectContaining({
        documentId: 'tgt',
        sectionId: 'ts',
        order: 4,
        passageKey: 't0279.3.4',
        content: 'Thus I have heard',
      }),
    ]);
    expect(searchMocks.indexParagraphs).toHaveBeenCalledWith(created);
    expect(result).toMatchObject({ order: 4, passageKey: 't0279.3.4', created: 2, searchError: null });
  });

  it('adds the source alone when no translation is given, even without a translation section', async () => {
    await appendPassage({ context: noTarget, source: '如是我聞', translation: '  ', userId: 'u1' });
    expect(mocks.createMany.mock.calls[0][0]).toHaveLength(1);
  });

  it('refuses, without writing, a translation with no section to go in, or an empty source', async () => {
    await expect(appendPassage({ context: noTarget, source: 'a', translation: 'b', userId: 'u1' })).rejects.toThrow();
    await expect(appendPassage({ context, source: '   ', userId: 'u1' })).rejects.toThrow();
    expect(mocks.createMany).not.toHaveBeenCalled();
  });

  it('refuses a key already used elsewhere in either document, without writing', async () => {
    mocks.findByDocumentIdAndPassageKeys.mockImplementation(async (documentId: string) =>
      documentId === 'tgt' ? [row('elsewhere', 'tgt', 't0279.3.4', 'z')] : [],
    );
    await expect(appendPassage({ context, source: 'a', userId: 'u1' })).rejects.toThrow('t0279.3.4');
    expect(mocks.createMany).not.toHaveBeenCalled();
  });

  // The rows are saved by then; throwing would invite a retry that adds the passage twice.
  it('reports a search failure instead of throwing', async () => {
    searchMocks.indexParagraphs.mockRejectedValueOnce(new Error('Algolia down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await appendPassage({ context, source: 'a', userId: 'u1' });
    expect(mocks.createMany).toHaveBeenCalled();
    expect(result.searchError).toBe('Algolia down');
  });

  // Saved, but not searchable: reported so the admin can shorten or split it.
  it('reports a paragraph too big for the search index', async () => {
    searchMocks.indexParagraphs.mockResolvedValueOnce([{ id: 'x', searchId: 'sx', bytes: 12000 }]);
    const result = await appendPassage({ context, source: 'a', userId: 'u1' });
    expect(result.searchTooBig).toEqual({ bytes: 12000, limit: 10000 });
    expect(result.searchError).toBeNull();
  });
});
