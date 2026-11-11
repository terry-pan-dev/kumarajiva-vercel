import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type IndexableParagraph } from '~/services/paragraph.record';
import { indexParagraphs, REBUILD_PAGE, rebuildParagraphIndex, searchAlgolia } from '~/services/search.server';

// Algolia and the database are mocked. What's worth testing here is the glue the pure modules
// can't see — which rows a search asks for counterparts of — and the rebuild's use of Algolia,
// where a wrong call order silently loses settings or records.
const algolia = vi.hoisted(() => ({
  indexExists: vi.fn(),
  search: vi.fn(),
  searchSingleIndex: vi.fn(),
  saveObjects: vi.fn(),
  deleteObjects: vi.fn(),
  replaceAllObjects: vi.fn(),
  getSettings: vi.fn(),
  setSettings: vi.fn(),
  waitForTask: vi.fn(),
}));
const paragraphs = vi.hoisted(() => ({
  findByIdsWithRelations: vi.fn(),
  findAlignedCandidates: vi.fn(),
  findPageForIndex: vi.fn(),
}));

vi.mock('~/providers/algolia', () => ({ default: algolia }));
vi.mock('~/lib/db.server', () => ({ getDb: () => ({}) }));
vi.mock('~/services/text.crud', () => ({ DbParagraphsNew: paragraphs }));

const indexable = (id: string, overrides: Partial<IndexableParagraph> = {}): IndexableParagraph => ({
  id,
  searchId: `search-${id}`,
  content: `content of ${id}`,
  ...overrides,
});

const hitRow = (id: string, workId: string, passageKey: string | null) => ({
  ...indexable(id),
  documentId: 'd1',
  sectionId: 's1',
  passageKey,
  order: 1,
  metadata: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  createdBy: 'u1',
  updatedBy: 'u1',
  section: { id: 's1', title: 'Section', order: 1 },
  document: { id: 'd1', title: 'Doc', language: 'chinese', key: null, workId, work: { title: 'Work' } },
});

beforeEach(() => {
  vi.clearAllMocks();
  algolia.indexExists.mockResolvedValue(true);
});

// ─── searchAlgolia (paragraphs) ──────────────────────────────────────────────

describe('searchAlgolia — paragraphs', () => {
  it('resolves hits to rows, looks up counterparts by their (work, key), and keeps relevance order', async () => {
    algolia.search.mockResolvedValue({
      results: [{ index: 'paragraphs', hits: [{ id: 'b' }, { id: 'stale' }, { id: 'a' }] }],
    });
    paragraphs.findByIdsWithRelations.mockResolvedValue([hitRow('a', 'w1', 'k1'), hitRow('b', 'w2', null)]);
    paragraphs.findAlignedCandidates.mockResolvedValue([
      {
        id: 'e1',
        content: 'Thus I have heard',
        passageKey: 'k1',
        order: 1,
        document: { id: 'd2', title: 'English', language: 'english', key: null, workId: 'w1' },
      },
    ]);

    const results = await searchAlgolia({ searchTerm: '如是', searchType: 'Paragraph' });

    // Counterparts are looked up from the rows that resolved, not from the raw hits.
    expect(paragraphs.findAlignedCandidates).toHaveBeenCalledWith(['w1', 'w2'], ['k1']);
    expect(results.map((r) => [r.type, r.id])).toEqual([
      ['Paragraph', 'b'],
      ['Paragraph', 'a'],
    ]);
    expect(results[1]).toMatchObject({ aligned: [{ id: 'e1' }] });
  });
});

// ─── indexParagraphs ─────────────────────────────────────────────────────────

describe('indexParagraphs', () => {
  const huge = indexable('big', { content: 'x'.repeat(10_001) });

  afterEach(() => {
    delete process.env.ALGOLIA_MAX_RECORD_BYTES;
  });

  // One record over the limit makes Algolia reject the whole batch, so it must not be sent.
  it('sends only records under the limit, deletes any old record of the rest, and returns them', async () => {
    const tooBig = await indexParagraphs([indexable('a'), huge]);
    expect(algolia.saveObjects.mock.calls[0][0].objects.map((o: { id: string }) => o.id)).toEqual(['a']);
    expect(algolia.deleteObjects).toHaveBeenCalledWith({ indexName: 'paragraphs', objectIDs: ['search-big'] });
    expect(tooBig).toEqual([{ id: 'big', searchId: 'search-big', bytes: expect.any(Number) }]);
  });

  it('reads the limit from ALGOLIA_MAX_RECORD_BYTES', async () => {
    process.env.ALGOLIA_MAX_RECORD_BYTES = '100000';
    expect(await indexParagraphs([huge])).toEqual([]);
    expect(algolia.deleteObjects).not.toHaveBeenCalled();
  });
});

// ─── rebuildParagraphIndex ───────────────────────────────────────────────────

describe('rebuildParagraphIndex', () => {
  // A full page followed by a short one, so paging has to continue past the first.
  const firstPage = Array.from({ length: REBUILD_PAGE }, (_, i) => indexable(`p${String(i).padStart(4, '0')}`));
  const secondPage = [indexable('q1'), indexable('q2', { searchId: null }), indexable('q3', { searchId: 'search-q1' })];

  beforeEach(() => {
    paragraphs.findPageForIndex.mockResolvedValueOnce(firstPage).mockResolvedValueOnce(secondPage);
    algolia.searchSingleIndex.mockResolvedValue({ nbHits: 21897 });
    // Algolia defaults, except for one setting already as configured, plus one we do not manage.
    algolia.getSettings.mockResolvedValue({ advancedSyntax: true, hitsPerPage: 20 });
    algolia.setSettings.mockResolvedValue({ taskID: 42 });
  });

  it('reads every page, continuing after the last id of each full page', async () => {
    await rebuildParagraphIndex({ apply: false });
    expect(paragraphs.findPageForIndex.mock.calls).toEqual([
      [null, REBUILD_PAGE],
      [firstPage[REBUILD_PAGE - 1].id, REBUILD_PAGE],
    ]);
  });

  // The Search Index page runs this on every load, so a dry run must never write.
  it('a dry run reports what would happen and writes nothing', async () => {
    const result = await rebuildParagraphIndex({ apply: false });
    expect(result).toEqual({
      applied: false,
      rows: REBUILD_PAGE + 3,
      records: REBUILD_PAGE + 1,
      withoutSearchId: ['q2'],
      duplicateSearchId: [{ id: 'q3', searchId: 'search-q1' }],
      tooBig: [],
      maxBytes: 10000,
      recordsBefore: 21897,
      settingsChanged: ['searchableAttributes', 'typoTolerance'],
      liveSettings: { advancedSyntax: true },
    });
    expect(algolia.setSettings).not.toHaveBeenCalled();
    expect(algolia.replaceAllObjects).not.toHaveBeenCalled();
    expect(algolia.saveObjects).not.toHaveBeenCalled();
  });

  // replaceAllObjects copies the live settings onto the index it swaps in, so settings set after
  // it would land on the index being thrown away.
  it('applied, sets the settings and waits for them before swapping the records in', async () => {
    await rebuildParagraphIndex({ apply: true });
    expect(algolia.setSettings).toHaveBeenCalledWith({
      indexName: 'paragraphs',
      indexSettings: { searchableAttributes: ['content'], typoTolerance: 'min', advancedSyntax: true },
    });
    const settled = algolia.waitForTask.mock.invocationCallOrder[0];
    expect(algolia.setSettings.mock.invocationCallOrder[0]).toBeLessThan(settled);
    expect(settled).toBeLessThan(algolia.replaceAllObjects.mock.invocationCallOrder[0]);
  });

  it('applied, swaps the whole index for exactly the built records', async () => {
    await rebuildParagraphIndex({ apply: true });
    const { indexName, objects } = algolia.replaceAllObjects.mock.calls[0][0];
    expect(indexName).toBe('paragraphs');
    expect(objects).toHaveLength(REBUILD_PAGE + 1);
    expect(objects.at(-1)).toEqual({ objectID: 'search-q1', id: 'q1', content: 'content of q1' });
  });

  // replaceAllObjects starts by copying the live index, so it cannot create one.
  it('applied with no index yet, creates it by saving the records', async () => {
    algolia.indexExists.mockResolvedValue(false);
    await rebuildParagraphIndex({ apply: true });
    expect(algolia.replaceAllObjects).not.toHaveBeenCalled();
    expect(algolia.saveObjects.mock.calls[0][0].objects).toHaveLength(REBUILD_PAGE + 1);
  });

  it('leaves out and reports rows over the record limit', async () => {
    paragraphs.findPageForIndex
      .mockReset()
      .mockResolvedValueOnce([{ ...indexable('big', { content: 'x'.repeat(10_001) }), passageKey: 'k.7' }]);
    const result = await rebuildParagraphIndex({ apply: true });
    expect(result.tooBig).toEqual([
      { id: 'big', searchId: 'search-big', bytes: expect.any(Number), passageKey: 'k.7' },
    ]);
    expect(algolia.replaceAllObjects.mock.calls[0][0].objects).toEqual([]);
  });

  // An empty table means an empty index: the stale records still have to go.
  it('with no paragraphs at all, still replaces the index (emptying it)', async () => {
    paragraphs.findPageForIndex.mockReset().mockResolvedValueOnce([]);
    await rebuildParagraphIndex({ apply: true });
    expect(algolia.replaceAllObjects.mock.calls[0][0].objects).toEqual([]);
  });
});
