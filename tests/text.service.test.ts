import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getSectionParagraphCounts,
  readParagraphsByDocumentId,
  readParagraphsBySectionId,
  reorderProjectSections,
  sectionOrderMoves,
  type ReferenceDocument,
} from '~/services/text.service';

// The paragraph queries are mocked; what's under test is how the service pairs
// and orders what they return.
const mocks = vi.hoisted(() => ({
  findBySectionId: vi.fn(),
  findByDocumentId: vi.fn(),
  findByDocumentIdAndPassageKeys: vi.fn(),
  countBySectionForDocument: vi.fn(),
}));
const sectionMocks = vi.hoisted(() => ({ findByDocumentId: vi.fn(), updateOrders: vi.fn() }));
const projectMocks = vi.hoisted(() => ({
  DbProjects: { findByIds: vi.fn(), findByDocumentId: vi.fn() },
  DbProjectReferences: { findByProjectId: vi.fn() },
}));

vi.mock('~/lib/db.server', () => ({ getDb: () => ({}) }));
vi.mock('~/services/search.server', () => ({}));
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
  { documentId: 'refA', document: { key: 'btts', title: 'BTTS rendering' } },
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
        content: 'Thus have I heard',
        metadata: { page: '201' },
      },
      { documentId: 'refB', key: null, title: 'Commentary', content: null, metadata: null },
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
