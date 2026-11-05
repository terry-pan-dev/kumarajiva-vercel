import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type IndexableParagraph } from '~/services/paragraph.record';
import { indexParagraphs, REBUILD_PAGE, rebuildParagraphIndex, searchAlgolia } from '~/services/search.server';

// Algolia and the database are mocked; what's under test is what search.server asks of them
// and how it combines the answers.
const algolia = vi.hoisted(() => ({
  indexExists: vi.fn(),
  search: vi.fn(),
  searchSingleIndex: vi.fn(),
  saveObjects: vi.fn(),
  replaceAllObjects: vi.fn(),
  deleteObjects: vi.fn(),
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
  beforeEach(() => {
    algolia.search.mockResolvedValue({
      results: [{ index: 'paragraphs', hits: [{ id: 'b' }, { id: 'stale' }, { id: 'a' }, { id: 'b' }] }],
    });
    paragraphs.findByIdsWithRelations.mockResolvedValue([hitRow('a', 'w1', 'k1'), hitRow('b', 'w2', null)]);
    paragraphs.findAlignedCandidates.mockResolvedValue([]);
  });

  it('asks only the paragraph index, with headroom for hits that will be dropped', async () => {
    await searchAlgolia({ searchTerm: '如是', searchType: 'Paragraph' });
    expect(algolia.search).toHaveBeenCalledWith({
      requests: [{ indexName: 'paragraphs', query: '如是', hitsPerPage: 20 }],
    });
  });

  it('resolves hits against paragraphs_new (repeated hits are collapsed when results are assembled)', async () => {
    await searchAlgolia({ searchTerm: '如是', searchType: 'Paragraph' });
    expect(paragraphs.findByIdsWithRelations).toHaveBeenCalledWith(['b', 'stale', 'a', 'b']);
  });

  it('looks up counterparts by the works and passage keys of the resolved hits', async () => {
    await searchAlgolia({ searchTerm: '如是', searchType: 'Paragraph' });
    expect(paragraphs.findAlignedCandidates).toHaveBeenCalledWith(['w1', 'w2'], ['k1']);
  });

  it('returns resolved hits in relevance order, typed as paragraphs, without stale or repeated hits', async () => {
    const results = await searchAlgolia({ searchTerm: '如是', searchType: 'Paragraph' });
    expect(results.map((r) => [r.type, r.id])).toEqual([
      ['Paragraph', 'b'],
      ['Paragraph', 'a'],
    ]);
  });

  it('ignores hits that carry no id (records written without one)', async () => {
    algolia.search.mockResolvedValue({ results: [{ index: 'paragraphs', hits: [{ id: undefined }, { id: 'a' }] }] });
    await searchAlgolia({ searchTerm: '如是', searchType: 'Paragraph' });
    expect(paragraphs.findByIdsWithRelations).toHaveBeenCalledWith(['a']);
  });

  it('queries both indexes when no type is given', async () => {
    algolia.search.mockResolvedValue({ results: [] });
    await searchAlgolia({ searchTerm: '如是' });
    expect(algolia.search.mock.calls[0][0].requests.map((r: { indexName: string }) => r.indexName)).toEqual([
      'paragraphs',
      'glossaries',
    ]);
  });

  it('returns nothing when neither index exists', async () => {
    algolia.indexExists.mockResolvedValue(false);
    expect(await searchAlgolia({ searchTerm: '如是' })).toEqual([]);
    expect(algolia.search).not.toHaveBeenCalled();
  });
});

// ─── indexParagraphs ─────────────────────────────────────────────────────────

describe('indexParagraphs', () => {
  it('saves the whole record of each row, and nothing the index does not hold', async () => {
    await indexParagraphs([{ ...indexable('a'), metadata: { page: '3' }, updatedBy: 'u9' } as IndexableParagraph]);
    expect(algolia.saveObjects).toHaveBeenCalledWith({
      indexName: 'paragraphs',
      objects: [
        {
          objectID: 'search-a',
          id: 'a',
          content: 'content of a',
        },
      ],
    });
  });

  it('skips rows without a search_id', async () => {
    await indexParagraphs([indexable('a', { searchId: null }), indexable('b')]);
    expect(algolia.saveObjects.mock.calls[0][0].objects.map((o: { id: string }) => o.id)).toEqual(['b']);
  });

  it('makes no request when there is nothing to save', async () => {
    await indexParagraphs([]);
    await indexParagraphs([indexable('a', { searchId: null })]);
    expect(algolia.saveObjects).not.toHaveBeenCalled();
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

  it('stops after a single short page', async () => {
    paragraphs.findPageForIndex.mockReset().mockResolvedValueOnce([indexable('a')]);
    const result = await rebuildParagraphIndex({ apply: false });
    expect(paragraphs.findPageForIndex).toHaveBeenCalledTimes(1);
    expect(result.rows).toBe(1);
  });

  it('a dry run reports what would happen and writes nothing', async () => {
    const result = await rebuildParagraphIndex({ apply: false });
    expect(result).toEqual({
      applied: false,
      rows: REBUILD_PAGE + 3,
      records: REBUILD_PAGE + 1,
      withoutSearchId: ['q2'],
      duplicateSearchId: [{ id: 'q3', searchId: 'search-q1' }],
      recordsBefore: 21897,
      settingsChanged: ['searchableAttributes', 'typoTolerance'],
      // Only the settings we manage, and only those that are set.
      liveSettings: { advancedSyntax: true },
    });
    expect(algolia.setSettings).not.toHaveBeenCalled();
    expect(algolia.replaceAllObjects).not.toHaveBeenCalled();
    expect(algolia.saveObjects).not.toHaveBeenCalled();
  });

  it('applied, sets the configured settings on the live index and waits for them', async () => {
    await rebuildParagraphIndex({ apply: true });
    expect(algolia.setSettings).toHaveBeenCalledWith({
      indexName: 'paragraphs',
      indexSettings: { searchableAttributes: ['content'], typoTolerance: 'min', advancedSyntax: true },
    });
    expect(algolia.waitForTask).toHaveBeenCalledWith({ indexName: 'paragraphs', taskID: 42 });
  });

  // replaceAllObjects copies the live settings onto the index it swaps in, so settings set after
  // it would land on the index being thrown away.
  it('applied, settles the settings before swapping the records in', async () => {
    await rebuildParagraphIndex({ apply: true });
    const settled = algolia.waitForTask.mock.invocationCallOrder[0];
    expect(settled).toBeLessThan(algolia.replaceAllObjects.mock.invocationCallOrder[0]);
    expect(algolia.setSettings.mock.invocationCallOrder[0]).toBeLessThan(settled);
  });

  it('sets the settings even when they already match (idempotent)', async () => {
    algolia.getSettings.mockResolvedValue({
      searchableAttributes: ['content'],
      typoTolerance: 'min',
      advancedSyntax: true,
    });
    const result = await rebuildParagraphIndex({ apply: true });
    expect(result.settingsChanged).toEqual([]);
    expect(algolia.setSettings).toHaveBeenCalledTimes(1);
  });

  it('counts the existing records with an empty query', async () => {
    await rebuildParagraphIndex({ apply: false });
    expect(algolia.searchSingleIndex).toHaveBeenCalledWith({
      indexName: 'paragraphs',
      searchParams: { query: '', hitsPerPage: 0 },
    });
  });

  it('applied, swaps the whole index for exactly the built records', async () => {
    const result = await rebuildParagraphIndex({ apply: true });
    expect(result.applied).toBe(true);
    expect(algolia.replaceAllObjects).toHaveBeenCalledTimes(1);
    const { indexName, objects, batchSize } = algolia.replaceAllObjects.mock.calls[0][0];
    expect({ indexName, batchSize }).toEqual({ indexName: 'paragraphs', batchSize: REBUILD_PAGE });
    expect(objects).toHaveLength(REBUILD_PAGE + 1);
    expect(objects.at(-1)).toMatchObject({ objectID: 'search-q1', id: 'q1' });
    expect(algolia.saveObjects).not.toHaveBeenCalled();
  });

  // replaceAllObjects starts by copying the live index, so it cannot create one.
  it('applied with no index yet, creates it by saving the records', async () => {
    algolia.indexExists.mockResolvedValue(false);
    const result = await rebuildParagraphIndex({ apply: true });
    expect(result.recordsBefore).toBe(0);
    expect(result.settingsChanged).toEqual(['searchableAttributes', 'typoTolerance', 'advancedSyntax']);
    expect(algolia.searchSingleIndex).not.toHaveBeenCalled();
    expect(algolia.getSettings).not.toHaveBeenCalled();
    expect(algolia.setSettings.mock.invocationCallOrder[0]).toBeLessThan(
      algolia.saveObjects.mock.invocationCallOrder[0],
    );
    expect(algolia.replaceAllObjects).not.toHaveBeenCalled();
    expect(algolia.saveObjects).toHaveBeenCalledWith(
      expect.objectContaining({ indexName: 'paragraphs', waitForTasks: true }),
    );
    expect(algolia.saveObjects.mock.calls[0][0].objects).toHaveLength(REBUILD_PAGE + 1);
  });

  // An empty table means an empty index: the stale records still have to go.
  it('with no paragraphs at all, still replaces the index (emptying it)', async () => {
    paragraphs.findPageForIndex.mockReset().mockResolvedValueOnce([]);
    await rebuildParagraphIndex({ apply: true });
    expect(algolia.replaceAllObjects.mock.calls[0][0].objects).toEqual([]);
  });
});
