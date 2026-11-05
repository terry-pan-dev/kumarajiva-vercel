import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type ReadGlossary } from '~/drizzle/tables';
import { GlossaryStore, inIdOrder, toGlossaryEntry } from '~/services/glossary.store';
import { type GlossaryTranslation } from '~/services/glossary.types';

// The database is mocked: a query-builder chain that resolves to whatever `rows` holds. What is
// tested is the store's own work — the entry shape it returns and the order it keeps — not SQL.
const db = vi.hoisted(() => {
  const state = { rows: [] as unknown[] };
  const chain: Record<string, unknown> = {};
  for (const method of ['from', 'where', 'orderBy', 'limit', 'offset']) chain[method] = vi.fn(() => chain);
  chain.then = (resolve: (rows: unknown[]) => unknown) => resolve(state.rows);
  const client = {
    select: vi.fn(() => chain),
    query: {
      glossariesTable: {
        findFirst: vi.fn(async () => state.rows[0]),
        findMany: vi.fn(async () => state.rows),
      },
    },
  };
  return { state, client };
});

vi.mock('~/lib/db.server', () => ({ getDb: () => db.client }));

const translation = (glossary: string): GlossaryTranslation => ({
  glossary,
  language: 'english',
  sutraName: '華嚴經',
  volume: '1',
  updatedBy: 'user-1',
  updatedAt: '2025-01-01T00:00:00.000Z',
});

const row = (id: string, translations: GlossaryTranslation[] | null = [translation(`t-${id}`)]): ReadGlossary =>
  ({
    id,
    glossary: `term-${id}`,
    phonetic: null,
    subscribers: 0,
    author: null,
    cbetaFrequency: null,
    translations,
    discussion: null,
    searchId: id,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    deletedAt: null,
    createdBy: 'user-1',
    updatedBy: 'user-1',
  }) as ReadGlossary;

beforeEach(() => {
  db.state.rows = [];
  vi.clearAllMocks();
});

// ─── Pure helpers ────────────────────────────────────────────────────────────

describe('toGlossaryEntry', () => {
  it('keeps every column and the translations as stored', () => {
    const stored = row('a');
    expect(toGlossaryEntry(stored)).toEqual(stored);
  });

  it('turns a null translations column into an empty list', () => {
    expect(toGlossaryEntry(row('a', null)).translations).toEqual([]);
  });
});

describe('inIdOrder', () => {
  it('returns the rows in the order of the ids, leaving out ids with no row', () => {
    const rows = [row('a'), row('b'), row('c')];
    expect(inIdOrder(['c', 'missing', 'a'], rows).map((r) => r.id)).toEqual(['c', 'a']);
  });
});

// ─── Reads return entries ────────────────────────────────────────────────────

describe('GlossaryStore reads', () => {
  it('findByIdsInOrder keeps the hit order and returns entries', async () => {
    db.state.rows = [row('a'), row('b', null)];
    const result = await GlossaryStore.findByIdsInOrder(['b', 'a', 'gone']);
    expect(result.map((r) => r.id)).toEqual(['b', 'a']);
    expect(result[0].translations).toEqual([]);
  });

  it('asks the database nothing for an empty id list', async () => {
    expect(await GlossaryStore.findByIdsInOrder([])).toEqual([]);
    expect(await GlossaryStore.findByIds([])).toEqual([]);
    expect(await GlossaryStore.findTrashedByIds([])).toEqual([]);
    expect(db.client.select).not.toHaveBeenCalled();
    expect(db.client.query.glossariesTable.findMany).not.toHaveBeenCalled();
  });

  it.each([
    ['findById', () => GlossaryStore.findById('a').then((r) => [r!])],
    ['findByIds', () => GlossaryStore.findByIds(['a'])],
    ['findByTerms', () => GlossaryStore.findByTerms(['term-a'])],
    ['findByTermsIncludingTrash', () => GlossaryStore.findByTermsIncludingTrash(['term-a'])],
    ['findByIdsIncludingTrash', () => GlossaryStore.findByIdsIncludingTrash(['a'])],
    ['findAll', () => GlossaryStore.findAll()],
    ['findPage', () => GlossaryStore.findPage({ page: 1, limit: 10 }).then((p) => p.glossaries)],
    ['findTrashed', () => GlossaryStore.findTrashed(10).then((t) => t.rows)],
    ['findTrashedByIds', () => GlossaryStore.findTrashedByIds(['a'])],
    ['findAllIncludingTrash', () => GlossaryStore.findAllIncludingTrash()],
    ['findForInspection', () => GlossaryStore.findForInspection('term', 10)],
    ['findIndexPage', () => GlossaryStore.findIndexPage({ afterId: null, limit: 10 })],
  ])('%s never returns null translations', async (_name, read) => {
    db.state.rows = [row('a', null)];
    const result = await read();
    expect(result[0].translations).toEqual([]);
  });

  it('findById returns undefined when there is no row', async () => {
    expect(await GlossaryStore.findById('missing')).toBeUndefined();
  });

  it('findForInspection asks nothing for a blank query', async () => {
    expect(await GlossaryStore.findForInspection('   ', 10)).toEqual([]);
    expect(db.client.select).not.toHaveBeenCalled();
  });
});
