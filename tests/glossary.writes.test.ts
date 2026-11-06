import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type GlossaryImportRow } from '~/services/glossary.parse';
import {
  createGlossaryAndIndexInAlgolia,
  importGlossaries,
  reviveTrashedGlossary,
  updateGlossaryTranslations,
} from '~/services/glossary.service';
import { type GlossaryEntry, type GlossaryTranslation } from '~/services/glossary.types';

// The store and Algolia are mocked. What is tested is that every write of translations goes
// through the store, as the whole list the term should end up with, and that search indexing
// around it behaves as before.
const store = vi.hoisted(() => ({
  findById: vi.fn(),
  findByIdsIncludingTrash: vi.fn(),
  findByTermsIncludingTrash: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  revive: vi.fn(),
  updateTerm: vi.fn(),
}));
const algolia = vi.hoisted(() => ({ saveObject: vi.fn(), partialUpdateObject: vi.fn() }));

vi.mock('openai', () => ({ default: class {} }));
vi.mock('~/lib/db.server', () => ({ getDb: () => ({}) }));
vi.mock('~/providers/algolia', () => ({ default: algolia }));
vi.mock('~/services/glossary.store', () => ({ GlossaryStore: store }));

const translation = (glossary: string, extra: Partial<GlossaryTranslation> = {}): GlossaryTranslation => ({
  glossary,
  language: 'english',
  sutraName: '華嚴經',
  volume: '1',
  originSutraText: null,
  targetSutraText: null,
  author: null,
  updatedBy: 'user-1',
  updatedAt: '2025-01-01T00:00:00.000Z',
  ...extra,
});

const entry = (id: string, extra: Partial<GlossaryEntry> = {}): GlossaryEntry =>
  ({
    id,
    glossary: `term-${id}`,
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
    translations: [],
    ...extra,
  }) as GlossaryEntry;

const term = { glossary: '佛', phonetic: 'fó', author: null, cbetaFrequency: null, discussion: null, updatedBy: 'u' };

beforeEach(() => {
  vi.clearAllMocks();
  store.update.mockImplementation(async (id: string, _term: unknown, translations: GlossaryTranslation[]) =>
    entry(id, { translations }),
  );
  store.create.mockImplementation(async (t: { id?: string }, translations: GlossaryTranslation[]) =>
    entry(t.id ?? 'new', { searchId: null, translations }),
  );
  store.revive.mockImplementation(async (id: string, _term: unknown, translations: GlossaryTranslation[]) =>
    entry(id, { searchId: null, translations }),
  );
  // Like the real one: the term's columns only, no translations.
  store.updateTerm.mockImplementation(async (id: string, data: object) => {
    const { translations, ...term } = entry(id);
    void translations;
    return { ...term, ...data };
  });
  store.findByIdsIncludingTrash.mockResolvedValue([]);
  store.findByTermsIncludingTrash.mockResolvedValue([]);
});

// ─── Edit and insert ─────────────────────────────────────────────────────────

describe('updateGlossaryTranslations', () => {
  const edit = (extra: Partial<Parameters<typeof updateGlossaryTranslations>[0]> = {}) =>
    updateGlossaryTranslations({
      id: 'g',
      phonetic: 'fó',
      author: null,
      cbetaFrequency: null,
      discussion: null,
      updatedBy: 'user-2',
      translations: [translation('edited')],
      ...extra,
    });

  it('an edit hands the store the form’s list, and the term columns apart from it', async () => {
    store.findById.mockResolvedValue(entry('g', { translations: [translation('old')] }));
    await edit();
    expect(store.update).toHaveBeenCalledWith(
      'g',
      { phonetic: 'fó', author: undefined, cbetaFrequency: undefined, updatedBy: 'user-2', discussion: undefined },
      [translation('edited')],
      undefined,
    );
  });

  it('an edit passes on the ids its list was built from', async () => {
    store.findById.mockResolvedValue(entry('g'));
    await edit({ basis: ['t1', 't2'] });
    expect(store.update.mock.calls[0][3]).toEqual(['t1', 't2']);
  });

  it('an insert’s basis is the stored translations it read', async () => {
    store.findById.mockResolvedValue(
      entry('g', { translations: [translation('a', { id: 't1' }), translation('b', { id: 't2' })] }),
    );
    await edit({ translations: [translation('c')], isNewInsert: true, basis: ['ignored'] });
    expect(store.update.mock.calls[0][3]).toEqual(['t1', 't2']);
  });

  it('an insert hands the store the stored list with the new translation after it', async () => {
    store.findById.mockResolvedValue(entry('g', { translations: [translation('a'), translation('b')] }));
    await edit({ translations: [translation('c')], isNewInsert: true });
    expect(store.update.mock.calls[0][2]).toEqual([translation('a'), translation('b'), translation('c')]);
  });

  // The saved entry can hold more than the list sent: translations added meanwhile are kept.
  it('updates the search record from the saved entry, after the save', async () => {
    store.findById.mockResolvedValue(entry('g'));
    store.update.mockImplementation(async () => {
      expect(algolia.partialUpdateObject).not.toHaveBeenCalled();
      return entry('g', { searchId: 'rec-g', translations: [translation('edited'), translation('added meanwhile')] });
    });
    await edit();
    expect(algolia.partialUpdateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        objectID: 'rec-g',
        attributesToUpdate: expect.objectContaining({
          translations: [
            { glossary: 'edited', language: 'english', phonetic: undefined },
            { glossary: 'added meanwhile', language: 'english', phonetic: undefined },
          ],
        }),
      }),
    );
  });

  it('leaves search alone when the store refuses the save', async () => {
    store.findById.mockResolvedValue(entry('g'));
    store.update.mockRejectedValue(new Error('stale'));
    await expect(edit()).rejects.toThrow('stale');
    expect(algolia.partialUpdateObject).not.toHaveBeenCalled();
  });

  it('keeps the save when the search record cannot be updated', async () => {
    store.findById.mockResolvedValue(entry('g'));
    algolia.partialUpdateObject.mockRejectedValueOnce(new Error('algolia down'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(edit()).resolves.toMatchObject({ id: 'g' });
    error.mockRestore();
  });

  it('writes nothing for an entry that is not there', async () => {
    store.findById.mockResolvedValue(undefined);
    await expect(edit()).rejects.toThrow('Glossary not found');
    expect(store.update).not.toHaveBeenCalled();
  });
});

// ─── Create and revive ───────────────────────────────────────────────────────

describe('createGlossaryAndIndexInAlgolia', () => {
  const newTerm = { id: 'n', glossary: '佛', createdBy: 'u', updatedBy: 'u' };

  it('creates the entry with its translations, indexes it, then points search_id at the record', async () => {
    const result = await createGlossaryAndIndexInAlgolia(newTerm, [translation('Buddha')]);
    expect(store.create).toHaveBeenCalledWith(newTerm, [translation('Buddha')]);
    expect(algolia.saveObject).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ objectID: 'n' }) }),
    );
    expect(store.updateTerm).toHaveBeenCalledWith('n', { searchId: 'n' });
    expect(result).toEqual([
      expect.objectContaining({ id: 'n', searchId: 'n', translations: [translation('Buddha')] }),
    ]);
  });

  it('returns the saved entry, unindexed, when indexing fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    algolia.saveObject.mockRejectedValueOnce(new Error('algolia down'));
    const [result] = await createGlossaryAndIndexInAlgolia(newTerm, [translation('Buddha')]);
    expect(store.updateTerm).not.toHaveBeenCalled();
    expect(result).toMatchObject({ id: 'n', searchId: null, translations: [translation('Buddha')] });
  });
});

describe('reviveTrashedGlossary', () => {
  it('revives through the store with the new contents, then indexes', async () => {
    const result = await reviveTrashedGlossary('t', term, [translation('Buddha')]);
    expect(store.revive).toHaveBeenCalledWith('t', term, [translation('Buddha')]);
    expect(store.updateTerm).toHaveBeenCalledWith('t', { searchId: 't' });
    expect(result).toEqual([expect.objectContaining({ id: 't', searchId: 't' })]);
  });

  it('throws when the row is no longer in the trash', async () => {
    store.revive.mockResolvedValue(undefined);
    await expect(reviveTrashedGlossary('t', term, [])).rejects.toThrow('no longer in the trash');
    expect(algolia.saveObject).not.toHaveBeenCalled();
  });
});

// ─── Import ──────────────────────────────────────────────────────────────────

describe('importGlossaries', () => {
  const fileRow = (key: string, englishTerm: string): GlossaryImportRow => ({
    uuid: '',
    chineseTerm: key,
    englishTerm,
    sutraName: '華嚴經',
    volume: '1',
    chineseSutraText: '',
    englishSutraText: '',
    author: '',
    phonetic: '',
    cbetaFrequency: '',
  });

  it('an existing entry gets the merge: its stored translations, then the file’s new ones', async () => {
    const stored = translation('Buddha');
    const existing = entry('e', { glossary: '佛', translations: [stored] });
    store.findByTermsIncludingTrash.mockResolvedValue([existing]);
    store.findById.mockResolvedValue(existing);

    const result = await importGlossaries([fileRow('佛', 'Buddha'), fileRow('佛', 'Awakened One')], 'importer');

    expect(result).toEqual({ created: 0, updated: 1, failed: 0 });
    const written = store.update.mock.calls[0][2] as GlossaryTranslation[];
    // Without a TranslationUUID a row is appended, even the one repeating the stored translation.
    expect(written.map((t) => t.glossary)).toEqual(['Buddha', 'Buddha', 'Awakened One']);
    expect(written[0]).toBe(stored);
  });

  it('the merge’s basis is the stored translations it was built from', async () => {
    const existing = entry('e', { glossary: '佛', translations: [translation('Buddha', { id: 't1' })] });
    store.findByTermsIncludingTrash.mockResolvedValue([existing]);
    store.findById.mockResolvedValue(existing);
    await importGlossaries([fileRow('佛', 'Awakened One')], 'importer');
    expect(store.update.mock.calls[0][3]).toEqual(['t1']);
  });

  it('a row naming a stored translation by TranslationUUID updates it, keeping its id', async () => {
    const existing = entry('e', {
      glossary: '佛',
      translations: [
        translation('Buddha', { id: 't1', rationale: 'old reason' }),
        translation('Awakened', { id: 't2' }),
      ],
    });
    store.findByTermsIncludingTrash.mockResolvedValue([existing]);
    store.findById.mockResolvedValue(existing);

    await importGlossaries(
      [{ ...fileRow('佛', 'the Buddha'), translationUuid: 't1', rationale: 'new reason' }],
      'importer',
    );

    const written = store.update.mock.calls[0][2] as GlossaryTranslation[];
    expect(written.map((t) => [t.id, t.glossary, t.rationale ?? null])).toEqual([
      ['t1', 'the Buddha', 'new reason'],
      ['t2', 'Awakened', null],
    ]);
    expect(written[0].updatedBy).toBe('importer');
  });

  it('a new term never takes the file’s translation ids', async () => {
    await importGlossaries(
      [{ ...fileRow('法', 'Dharma'), translationUuid: 't-from-file', rationale: 'why' }],
      'importer',
    );
    const [created] = store.create.mock.calls[0][1] as GlossaryTranslation[];
    expect(created).not.toHaveProperty('id');
    expect(created.rationale).toBe('why');
  });

  it('a revived term never takes the file’s translation ids', async () => {
    store.findByTermsIncludingTrash.mockResolvedValue([entry('t', { glossary: '僧', deletedAt: new Date() })]);
    await importGlossaries([{ ...fileRow('僧', 'Saṅgha'), translationUuid: 't-from-file' }], 'importer');
    const [revived] = store.revive.mock.calls[0][2] as GlossaryTranslation[];
    expect(revived).not.toHaveProperty('id');
  });

  it('a new term is created with the file’s translations', async () => {
    const result = await importGlossaries([fileRow('法', 'Dharma')], 'importer');
    expect(result).toEqual({ created: 1, updated: 0, failed: 0 });
    expect(store.create.mock.calls[0][0]).toMatchObject({ glossary: '法', createdBy: 'importer' });
    expect((store.create.mock.calls[0][1] as GlossaryTranslation[]).map((t) => t.glossary)).toEqual(['Dharma']);
  });

  it('a trashed term is revived with only the file’s translations', async () => {
    store.findByTermsIncludingTrash.mockResolvedValue([
      entry('t', { glossary: '僧', deletedAt: new Date(), translations: [translation('old')] }),
    ]);
    const result = await importGlossaries([fileRow('僧', 'Saṅgha')], 'importer');
    expect(result).toEqual({ created: 1, updated: 0, failed: 0 });
    expect(store.revive.mock.calls[0][0]).toBe('t');
    expect((store.revive.mock.calls[0][2] as GlossaryTranslation[]).map((t) => t.glossary)).toEqual(['Saṅgha']);
  });
});
