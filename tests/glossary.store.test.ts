import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type ReadGlossaryTranslation } from '~/drizzle/tables';
import { TranslationListError } from '~/services/glossary.diff';
import { GlossaryStore, inIdOrder } from '~/services/glossary.store';
import { type GlossaryTranslation } from '~/services/glossary.types';

// The database is faked: every query is recorded with its table and payload, and resolves to
// what the fake holds for that table. SQL conditions are opaque here, so a select returns all
// the fake's rows of that table; what is tested is the store's own work (the entry shape, the
// order, which rows it writes and how), not the SQL. The SQL is checked against the dev
// database (docs/plans/glossary-refactor.md, "How each PR so far was checked").
const db = vi.hoisted(() => {
  const NAME = Symbol.for('drizzle:Name');
  type Row = Record<string, unknown>;
  type Call = {
    op: 'select' | 'insert' | 'update' | 'delete';
    table: string;
    selection?: Row;
    values?: unknown;
    set?: Row;
  };

  const state = {
    terms: [] as Row[],
    translations: [] as Row[],
    // What an update of `glossaries` returns: the row it matched, or none.
    updatedTerms: [] as Row[],
    calls: [] as Call[],
    nextId: 0,
  };

  const result = (call: Call): unknown[] => {
    if (call.op === 'select' && call.selection && 'count' in call.selection) return [{ count: state.terms.length }];
    if (call.table === 'glossaries') {
      if (call.op === 'select') return state.terms;
      if (call.op === 'insert') return [{ id: 'new-term', ...(call.values as Row) }];
      if (call.op === 'update') return state.updatedTerms;
      return [];
    }
    if (call.op === 'select') return state.translations;
    if (call.op === 'insert') {
      const inserted = (call.values as Row[]).map((values) => ({
        id: `new-${++state.nextId}`,
        createdAt: new Date('2026-11-05'),
        updatedAt: new Date('2026-11-05'),
        deletedAt: null,
        ...values,
      }));
      state.translations.push(...inserted);
      return inserted;
    }
    return [];
  };

  const query = (op: Call['op'], table?: Record<symbol, string>, selection?: Row) => {
    const call: Call = { op, table: table?.[NAME] ?? '', selection };
    const chain: Record<string, unknown> = {
      from: (t: Record<symbol, string>) => {
        call.table = t[NAME];
        return chain;
      },
      values: (values: unknown) => {
        call.values = values;
        return chain;
      },
      set: (set: Row) => {
        call.set = set;
        return chain;
      },
      then: (resolve: (rows: unknown[]) => unknown) => {
        state.calls.push(call);
        return resolve(result(call));
      },
    };
    for (const method of ['where', 'orderBy', 'limit', 'offset', 'returning']) chain[method] = () => chain;
    return chain;
  };

  const client = {
    select: vi.fn((selection?: Row) => query('select', undefined, selection)),
    insert: vi.fn((table: Record<symbol, string>) => query('insert', table)),
    update: vi.fn((table: Record<symbol, string>) => query('update', table)),
    delete: vi.fn((table: Record<symbol, string>) => query('delete', table)),
    transaction: vi.fn(async (work: (tx: unknown) => Promise<unknown>) => work(client)),
  };

  // The calls on glossary_translations other than reads: the store's translation writes.
  const translationWrites = () =>
    state.calls.filter((call) => call.table === 'glossary_translations' && call.op !== 'select');

  return { state, client, translationWrites };
});

vi.mock('~/lib/db.server', () => ({ getDb: () => db.client }));

const translation = (term: string, extra: Partial<GlossaryTranslation> = {}): GlossaryTranslation => ({
  term,
  language: 'english',
  sourceName: '華嚴經',
  volume: '1',
  updatedBy: 'user-1',
  updatedAt: '2025-01-01T00:00:00.000Z',
  ...extra,
});

const term = (id: string) => ({
  id,
  sourceTerm: `term-${id}`,
  phonetic: null,
  author: null,
  cbetaFrequency: null,
  discussion: null,
  searchId: id,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  deletedAt: null,
  createdBy: 'user-1',
  updatedBy: 'user-1',
});

const translationRow = (
  id: string,
  glossaryId: string,
  position: number,
  rendering: string,
  extra: Partial<ReadGlossaryTranslation> = {},
): ReadGlossaryTranslation => ({
  id,
  glossaryId,
  position,
  language: 'english',
  term: rendering,
  sourceName: '華嚴經',
  volume: '1',
  sourceText: null,
  targetText: null,
  author: null,
  rationale: null,
  metadata: null,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  deletedAt: null,
  createdBy: 'user-1',
  updatedBy: 'user-1',
  ...extra,
});

beforeEach(() => {
  db.state.terms = [];
  db.state.translations = [];
  db.state.updatedTerms = [];
  db.state.calls = [];
  db.state.nextId = 0;
  vi.clearAllMocks();
});

// ─── Pure helpers ────────────────────────────────────────────────────────────

describe('inIdOrder', () => {
  it('returns the rows in the order of the ids, leaving out ids with no row', () => {
    const rows = [term('a'), term('b'), term('c')];
    expect(inIdOrder(['c', 'missing', 'a'], rows).map((r) => r.id)).toEqual(['c', 'a']);
  });
});

// ─── Reads return entries ────────────────────────────────────────────────────

describe('GlossaryStore reads', () => {
  it('attaches each term its own translations, in position order', async () => {
    db.state.terms = [term('a'), term('b')];
    db.state.translations = [
      translationRow('t2', 'a', 1, 'second'),
      translationRow('t9', 'other', 0, 'not this term'),
      translationRow('t1', 'a', 0, 'first'),
    ];
    const [a, b] = await GlossaryStore.findByIds(['a', 'b']);
    expect(a.translations.map((t) => [t.id, t.term])).toEqual([
      ['t1', 'first'],
      ['t2', 'second'],
    ]);
    expect(b.translations).toEqual([]);
  });

  it('findByIdsInOrder keeps the hit order', async () => {
    db.state.terms = [term('a'), term('b')];
    const result = await GlossaryStore.findByIdsInOrder(['b', 'a', 'gone']);
    expect(result.map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('asks the database nothing for an empty id list', async () => {
    expect(await GlossaryStore.findByIdsInOrder([])).toEqual([]);
    expect(await GlossaryStore.findByIds([])).toEqual([]);
    expect(await GlossaryStore.findTrashedByIds([])).toEqual([]);
    expect(db.client.select).not.toHaveBeenCalled();
  });

  // Column move, deploy B: the headword is read from source_term; temp_term (where deploy A kept
  // it) is neither read nor written until deploy C drops it.
  it('reads the headword from source_term, never temp_term', async () => {
    db.state.terms = [term('a')];
    await GlossaryStore.findById('a');
    // The columns object passed to select(): property name → Drizzle column.
    const termSelect = db.client.select.mock.calls[0][0] as unknown as Record<string, { name: string }>;
    expect(termSelect.sourceTerm.name).toBe('source_term');
    expect(termSelect).not.toHaveProperty('legacyTempTerm');
    expect(Object.values(termSelect).map((column) => column.name)).not.toContain('temp_term');
  });

  it('asks for no translations when no term matched', async () => {
    expect(await GlossaryStore.findByTerms(['nothing'])).toEqual([]);
    expect(db.state.calls.map((call) => call.table)).toEqual(['glossaries']);
  });

  it.each([
    ['findById', () => GlossaryStore.findById('a').then((r) => [r!])],
    ['findByIds', () => GlossaryStore.findByIds(['a'])],
    ['findByIdsInOrder', () => GlossaryStore.findByIdsInOrder(['a'])],
    ['findByTerms', () => GlossaryStore.findByTerms(['term-a'])],
    ['findByTermsIncludingTrash', () => GlossaryStore.findByTermsIncludingTrash(['term-a'])],
    ['findByIdsIncludingTrash', () => GlossaryStore.findByIdsIncludingTrash(['a'])],
    ['findAll', () => GlossaryStore.findAll()],
    ['findPage', () => GlossaryStore.findPage({ page: 1, limit: 10 }).then((p) => p.glossaries)],
    ['findTrashed', () => GlossaryStore.findTrashed(10).then((t) => t.rows)],
    ['findTrashedByIds', () => GlossaryStore.findTrashedByIds(['a'])],
    ['findAllIncludingTrash', () => GlossaryStore.findAllIncludingTrash()],
    ['findForInspection', () => GlossaryStore.findForInspection('term', 10)],
    ['findForInspection by uuid', () => GlossaryStore.findForInspection('0000fe57-0000-4000-8000-000000000001', 10)],
    ['findIndexPage', () => GlossaryStore.findIndexPage({ afterId: null, limit: 10 })],
  ])('%s returns the translations from the table, in the read shape', async (_name, read) => {
    db.state.terms = [term('a')];
    db.state.translations = [translationRow('t1', 'a', 0, 'Buddha', { metadata: { partOfSpeech: 'noun' } })];
    const [entry] = await read();
    expect(entry.translations).toEqual([
      expect.objectContaining({ id: 't1', term: 'Buddha', sourceName: '華嚴經', partOfSpeech: 'noun' }),
    ]);
  });

  it('findPage counts the live terms', async () => {
    db.state.terms = [term('a'), term('b')];
    expect((await GlossaryStore.findPage({ page: 1, limit: 10 })).totalCount).toBe(2);
  });

  it('findById returns undefined when there is no row', async () => {
    expect(await GlossaryStore.findById('missing')).toBeUndefined();
  });

  it('findForInspection asks nothing for a blank query', async () => {
    expect(await GlossaryStore.findForInspection('   ', 10)).toEqual([]);
    expect(db.client.select).not.toHaveBeenCalled();
  });
});

// ─── Writes ──────────────────────────────────────────────────────────────────

describe('GlossaryStore.create', () => {
  const newTerm = { sourceTerm: '佛', createdBy: 'user-1', updatedBy: 'user-1' };

  it('inserts the term, then one row per translation in order, in one transaction', async () => {
    const created = await GlossaryStore.create(newTerm, [
      translation('Buddha', { updatedBy: 'user-2' }),
      translation('the Awakened One', { updatedBy: 'user-2' }),
    ]);

    expect(db.client.transaction).toHaveBeenCalledTimes(1);
    const [termInsert, rowsInsert] = db.state.calls;
    expect(termInsert).toMatchObject({ op: 'insert', table: 'glossaries', values: newTerm });
    expect(termInsert.values).not.toHaveProperty('translations');
    expect(rowsInsert.values).toEqual([
      expect.objectContaining({
        glossaryId: 'new-term',
        position: 0,
        term: 'Buddha',
        createdBy: 'user-2',
        updatedBy: 'user-2',
      }),
      expect.objectContaining({ glossaryId: 'new-term', position: 1, term: 'the Awakened One' }),
    ]);
    expect(created.translations.map((t) => [t.id, t.term])).toEqual([
      ['new-1', 'Buddha'],
      ['new-2', 'the Awakened One'],
    ]);
  });

  it('inserts no rows for a term without translations', async () => {
    const created = await GlossaryStore.create(newTerm, []);
    expect(db.translationWrites()).toEqual([]);
    expect(created.translations).toEqual([]);
  });
});

describe('GlossaryStore.update', () => {
  const stored = () => [
    translationRow('t1', 'a', 0, 'Buddha'),
    translationRow('t2', 'a', 1, 'Dharma'),
    translationRow('t3', 'a', 2, 'Sangha'),
  ];
  const asStored = (id: string, rendering: string) => translation(rendering, { id });

  beforeEach(() => {
    db.state.updatedTerms = [term('a')];
    db.state.translations = stored();
  });

  it('writes the term columns only, in a transaction', async () => {
    await GlossaryStore.update('a', { phonetic: 'fó' }, [
      asStored('t1', 'Buddha'),
      asStored('t2', 'Dharma'),
      asStored('t3', 'Sangha'),
    ]);
    expect(db.client.transaction).toHaveBeenCalledTimes(1);
    expect(db.state.calls[0]).toMatchObject({ op: 'update', table: 'glossaries', set: { phonetic: 'fó' } });
  });

  // Drizzle refuses an empty SET; the insert form passes no term columns at all.
  it('never sends an empty SET for the term, and stamps it as edited', async () => {
    await GlossaryStore.update('a', { phonetic: undefined }, [translation('new')]);
    expect(db.state.calls[0].set).toMatchObject({ updatedAt: expect.any(Date) });
  });

  it('writes no translation when the list is the stored one', async () => {
    await GlossaryStore.update('a', {}, [asStored('t1', 'Buddha'), asStored('t2', 'Dharma'), asStored('t3', 'Sangha')]);
    expect(db.translationWrites()).toEqual([]);
  });

  it('removes, edits, moves and adds by id', async () => {
    await GlossaryStore.update('a', {}, [
      asStored('t1', 'the Buddha'), // edited
      asStored('t3', 'Sangha'), // moved from 2 to 1
      translation('Saṅgha', { updatedBy: 'user-2' }), // new
    ]);
    const [remove, edit, move, insert] = db.translationWrites();

    expect(remove.op).toBe('delete');
    expect(edit).toMatchObject({ op: 'update', set: { term: 'the Buddha', position: 0, updatedBy: 'user-1' } });
    // Moved only: the position changes, and updated_at is set to itself so it is not re-stamped.
    expect(move.op).toBe('update');
    expect(Object.keys(move.set!)).toEqual(['position', 'updatedAt']);
    expect(move.set!.position).toBe(1);
    expect(insert).toMatchObject({
      op: 'insert',
      values: [expect.objectContaining({ glossaryId: 'a', position: 2, term: 'Saṅgha', createdBy: 'user-2' })],
    });
  });

  it('keeps a translation outside the basis, added since the list was built', async () => {
    // Built from t1 and t2 only: t3 was added by someone else meanwhile.
    await GlossaryStore.update('a', {}, [asStored('t1', 'Buddha'), asStored('t2', 'Dharma')], ['t1', 't2']);
    expect(db.translationWrites()).toEqual([]);
  });

  it('deletes nothing when nothing is left out', async () => {
    await GlossaryStore.update('a', {}, [
      asStored('t1', 'Buddha'),
      asStored('t2', 'Dharma'),
      asStored('t3', 'Sangha'),
      translation('new'),
    ]);
    expect(db.translationWrites().map((call) => call.op)).toEqual(['insert']);
  });

  it('refuses a list naming a translation the term does not have, writing none', async () => {
    await expect(GlossaryStore.update('a', {}, [asStored('gone', 'Buddha')])).rejects.toThrow(TranslationListError);
    expect(db.translationWrites()).toEqual([]);
  });

  it('returns undefined and touches no translation when no row has the id', async () => {
    db.state.updatedTerms = [];
    expect(await GlossaryStore.update('missing', {}, [translation('x')])).toBeUndefined();
    expect(db.state.calls.filter((call) => call.table === 'glossary_translations')).toEqual([]);
  });
});

describe('GlossaryStore.revive', () => {
  it('takes the row out of the trash, unindexed, and replaces every translation', async () => {
    db.state.updatedTerms = [term('t')];
    const revived = await GlossaryStore.revive('t', { sourceTerm: '佛' }, [translation('Buddha')]);

    expect(db.client.transaction).toHaveBeenCalledTimes(1);
    expect(db.state.calls[0]).toMatchObject({
      op: 'update',
      table: 'glossaries',
      set: { sourceTerm: '佛', deletedAt: null, searchId: null },
    });
    expect(db.state.calls[0].set).not.toHaveProperty('translations');
    expect(db.translationWrites().map((call) => call.op)).toEqual(['delete', 'insert']);
    expect(revived?.translations.map((t) => t.term)).toEqual(['Buddha']);
  });

  it('keeps the row’s uuid when the term carries a new one (the create form’s)', async () => {
    db.state.updatedTerms = [term('t')];
    const fromCreateForm = { id: 'new-uuid', sourceTerm: '佛' };
    await GlossaryStore.revive('t', fromCreateForm, [translation('Buddha')]);
    expect(db.state.calls[0].set).not.toHaveProperty('id');
  });

  it('returns undefined and touches no translation when the row is not in the trash', async () => {
    expect(await GlossaryStore.revive('live', {}, [translation('x')])).toBeUndefined();
    expect(db.translationWrites()).toEqual([]);
  });
});

describe('GlossaryStore.updateTerm', () => {
  it('writes the given term columns only and touches no translation', async () => {
    db.state.updatedTerms = [term('a')];
    const updated = await GlossaryStore.updateTerm('a', { searchId: 'a' });
    expect(db.state.calls).toEqual([
      expect.objectContaining({ op: 'update', table: 'glossaries', set: { searchId: 'a' } }),
    ]);
    expect(updated?.id).toBe('a');
  });
});
