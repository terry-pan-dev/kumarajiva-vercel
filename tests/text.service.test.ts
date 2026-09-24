import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getSectionParagraphCounts,
  readParagraphsByDocumentId,
  readParagraphsBySectionId,
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

vi.mock('~/lib/db.server', () => ({ getDb: () => ({}) }));
vi.mock('~/services/search.server', () => ({}));
vi.mock('~/services/text.crud', () => ({
  DbParagraphsNew: mocks,
  DbContributors: {},
  DbDocuments: {},
  DbSections: {},
  DbWorks: {},
}));

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
  target: [row('t1', 'target', 'k1', 'Thus I have heard'), row('t2', 'target', 'k2', 'At one time')],
  refA: [row('a1', 'refA', 'k1', 'Thus have I heard')],
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

    expect(first).toMatchObject({ origin: '如是我聞', target: 'Thus I have heard', targetId: 't1' });
    expect(first.references).toEqual([
      { documentId: 'refA', key: 'btts', title: 'BTTS rendering', content: 'Thus have I heard' },
      { documentId: 'refB', key: null, title: 'Commentary', content: null },
    ]);
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
