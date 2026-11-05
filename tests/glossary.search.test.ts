import { beforeEach, describe, expect, it, vi } from 'vitest';

import { searchGlossaries } from '~/services/edge.only';
import { searchAlgolia } from '~/services/search.server';

// Algolia and the store are mocked. What is tested is how a search turns hits into entries:
// duplicate records collapse to one entry, the hit order is kept, and the entries come from
// the store (so they carry translations in the store's shape).
const algolia = vi.hoisted(() => ({ indexExists: vi.fn(), search: vi.fn() }));
const store = vi.hoisted(() => ({ findByIdsInOrder: vi.fn() }));

vi.mock('~/providers/algolia', () => ({ default: algolia }));
vi.mock('~/lib/db.server', () => ({ getDb: () => ({}) }));
vi.mock('~/services/glossary.store', () => ({ GlossaryStore: store }));

const entry = (id: string) => ({ id, glossary: `term-${id}`, translations: [] });

beforeEach(() => {
  vi.clearAllMocks();
  algolia.indexExists.mockResolvedValue(true);
  store.findByIdsInOrder.mockImplementation(async (ids: string[]) => ids.map(entry));
});

describe('searchGlossaries (glossary page search)', () => {
  it('collapses duplicate records, keeps the hit order and caps at the limit', async () => {
    algolia.search.mockResolvedValue({
      results: [{ hits: [{ id: 'b' }, { id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }] }],
    });
    const result = await searchGlossaries('term', 3);
    expect(store.findByIdsInOrder).toHaveBeenCalledWith(['b', 'a', 'c']);
    expect(result.map((r) => r.id)).toEqual(['b', 'a', 'c']);
  });

  it('returns nothing, and reads nothing, when the index does not exist', async () => {
    algolia.indexExists.mockResolvedValue(false);
    expect(await searchGlossaries('term')).toEqual([]);
    expect(store.findByIdsInOrder).not.toHaveBeenCalled();
  });
});

describe('searchAlgolia — glossaries (sidebar search)', () => {
  it('collapses duplicate records, keeps the hit order and tags the results', async () => {
    algolia.search.mockResolvedValue({
      results: [{ index: 'glossaries', hits: [{ id: 'b' }, { id: 'b' }, { id: 'a' }] }],
    });
    const result = await searchAlgolia({ searchTerm: 'term', searchType: 'Glossary' });
    expect(store.findByIdsInOrder).toHaveBeenCalledWith(['b', 'a']);
    expect(result).toEqual([
      { ...entry('b'), type: 'Glossary' },
      { ...entry('a'), type: 'Glossary' },
    ]);
  });
});
