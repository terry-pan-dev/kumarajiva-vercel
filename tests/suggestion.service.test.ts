import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type ReadSuggestion } from '~/drizzle/tables';
import { TranslationListError } from '~/services/glossary.diff';
import { type GlossaryEntry, type GlossaryTranslation } from '~/services/glossary.types';
import { SuggestionError } from '~/services/suggestion.rules';
import {
  acceptSuggestion,
  dismissFlag,
  editOwnSuggestion,
  enrichSuggestion,
  flagToEdit,
  mergeIntoTerm,
  rejectSuggestion,
  removeFlaggedTranslation,
  reviewSuggestion,
  submitSuggestion,
  withdrawSuggestion,
} from '~/services/suggestion.service';
import { type UserRole } from '~/utils/constants';

// The suggestion lifecycle. The suggestion store, the glossary store and the glossary service
// are mocked; permissions are the real role table. What is tested: who may do each step, what
// each step writes, and that accepting writes to the glossary exactly once, through the
// glossary service, releasing its claim if that write fails.
const suggestions = vi.hoisted(() => ({
  findById: vi.fn(),
  create: vi.fn(),
  updatePending: vi.fn(),
  releaseClaim: vi.fn(),
  setApplied: vi.fn(),
  list: vi.fn(),
  findPendingByGlossaryIds: vi.fn(),
  findPendingNewTerms: vi.fn(),
  findByGlossaryId: vi.fn(),
}));
const glossaryStore = vi.hoisted(() => ({
  findById: vi.fn(),
  findByTerms: vi.fn(),
  findByTermsIncludingTrash: vi.fn(),
}));
const glossaryService = vi.hoisted(() => ({
  createGlossaryAndIndexInAlgolia: vi.fn(),
  reviveTrashedGlossary: vi.fn(),
  updateGlossaryTranslations: vi.fn(),
}));

vi.mock('~/lib/db.server', () => ({ getDb: () => ({}) }));
vi.mock('~/services/suggestion.store', () => ({ SuggestionStore: suggestions }));
vi.mock('~/services/glossary.store', () => ({ GlossaryStore: glossaryStore }));
vi.mock('~/services/glossary.service', () => glossaryService);
vi.mock('~/services/user.service', () => ({
  readUsers: vi.fn(async () => [{ id: 'u-editor', username: 'Ananda' }]),
}));

const as = (role: UserRole) => ({ id: `u-${role}`, role });
const admin = as('admin');
const editor = as('editor');

const translation = (id: string, extra: Partial<GlossaryTranslation> = {}): GlossaryTranslation => ({
  id,
  term: `term-${id}`,
  language: 'english',
  sourceName: '金剛經',
  volume: '1',
  sourceText: null,
  targetText: null,
  author: null,
  partOfSpeech: null,
  phonetic: null,
  discussion: null,
  updatedBy: 'someone',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...extra,
});

const entry = (translations: GlossaryTranslation[], extra: Partial<GlossaryEntry> = {}): GlossaryEntry =>
  ({
    id: 'g1',
    sourceTerm: '般若',
    phonetic: null,
    author: null,
    cbetaFrequency: null,
    discussion: null,
    searchId: 'g1',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    deletedAt: null,
    createdBy: 'someone',
    updatedBy: 'someone',
    translations,
    ...extra,
  }) as GlossaryEntry;

const suggestion = (extra: Partial<ReadSuggestion> = {}): ReadSuggestion =>
  ({
    id: 's1',
    targetKind: 'glossary_translation',
    action: 'create',
    status: 'pending',
    glossaryId: 'g1',
    translationId: null,
    base: null,
    submitted: { term: 'wisdom' },
    proposed: { term: 'wisdom', language: 'english' },
    note: null,
    context: null,
    enrichedBy: null,
    enrichedAt: null,
    readyBy: null,
    readyAt: null,
    reviewVerdict: null,
    reviewNote: null,
    reviewedBy: null,
    reviewedAt: null,
    decidedBy: null,
    decidedAt: null,
    decisionNote: null,
    appliedId: null,
    createdAt: new Date('2026-11-01'),
    updatedAt: new Date('2026-11-01'),
    deletedAt: null,
    createdBy: 'u-editor',
    updatedBy: 'u-editor',
    ...extra,
  }) as ReadSuggestion;

// The error code a call is refused with, or 'ok'.
const codeOf = async (run: () => Promise<unknown>) => {
  try {
    await run();
  } catch (error) {
    if (error instanceof SuggestionError) return error.code;
    throw error;
  }
  return 'ok';
};

const lastPatch = () => suggestions.updatePending.mock.calls.at(-1)?.[1];
const glossaryWrites = () =>
  glossaryService.createGlossaryAndIndexInAlgolia.mock.calls.length +
  glossaryService.reviveTrashedGlossary.mock.calls.length +
  glossaryService.updateGlossaryTranslations.mock.calls.length;

beforeEach(() => {
  vi.clearAllMocks();
  suggestions.create.mockImplementation(async (row) => suggestion(row));
  suggestions.updatePending.mockImplementation(async (id, patch) => suggestion({ id, ...patch }));
  glossaryStore.findByTerms.mockResolvedValue([]);
  glossaryStore.findByTermsIncludingTrash.mockResolvedValue([]);
});

// ─── Submitting ──────────────────────────────────────────────────────────────

describe('submitSuggestion', () => {
  it('records a new term as submitted and proposed alike, by anyone', async () => {
    await submitSuggestion(as('reader'), {
      kind: 'new-term',
      proposed: { sourceTerm: '菩提', translation: { term: 'awakening' } },
      note: 'heard in class',
    });
    const row = suggestions.create.mock.calls[0][0];
    expect(row).toMatchObject({
      targetKind: 'glossary_term',
      action: 'create',
      note: 'heard in class',
      createdBy: 'u-reader',
    });
    expect(row.submitted).toEqual(row.proposed);
    expect(row.glossaryId).toBeUndefined();
  });

  it('refuses a new term already in the glossary', async () => {
    glossaryStore.findByTerms.mockResolvedValue([entry([])]);
    const error = await submitSuggestion(editor, {
      kind: 'new-term',
      proposed: { sourceTerm: '般若', translation: { term: 'x' } },
    }).catch((e) => e);
    // The entry's id goes with it, so the form can offer to suggest a translation of it instead.
    expect(error).toMatchObject({ code: 'term-exists', glossaryId: 'g1' });
    const run = () =>
      submitSuggestion(editor, { kind: 'new-term', proposed: { sourceTerm: '般若', translation: { term: 'x' } } });
    expect(await codeOf(run)).toBe('term-exists');
    expect(suggestions.create).not.toHaveBeenCalled();
  });

  it('refuses a translation for a term that no longer exists', async () => {
    glossaryStore.findById.mockResolvedValue(undefined);
    const run = () => submitSuggestion(editor, { kind: 'new-translation', glossaryId: 'g1', proposed: { term: 'x' } });
    expect(await codeOf(run)).toBe('target-gone');
  });

  it('records an edit with the translation as it is now, and refuses one that changes nothing', async () => {
    glossaryStore.findById.mockResolvedValue(entry([translation('t1', { term: 'wisdom' })]));
    await submitSuggestion(editor, {
      kind: 'edit',
      glossaryId: 'g1',
      translationId: 't1',
      proposed: { term: 'insight' },
    });
    expect(suggestions.create.mock.calls[0][0]).toMatchObject({
      action: 'edit',
      translationId: 't1',
      base: expect.objectContaining({ term: 'wisdom' }),
      proposed: { term: 'insight' },
    });
    const same = () =>
      submitSuggestion(editor, { kind: 'edit', glossaryId: 'g1', translationId: 't1', proposed: { term: 'wisdom' } });
    expect(await codeOf(same)).toBe('nothing-changed');
  });

  it('refuses an edit of a translation the term does not have', async () => {
    glossaryStore.findById.mockResolvedValue(entry([translation('t1')]));
    const run = () =>
      submitSuggestion(editor, { kind: 'edit', glossaryId: 'g1', translationId: 't9', proposed: { term: 'x' } });
    expect(await codeOf(run)).toBe('target-gone');
  });

  it('needs a note to flag a translation', async () => {
    glossaryStore.findById.mockResolvedValue(entry([translation('t1')]));
    const run = (note: string) =>
      submitSuggestion(editor, { kind: 'flag', glossaryId: 'g1', translationId: 't1', note });
    expect(await codeOf(() => run('  '))).toBe('invalid');
    expect(await codeOf(() => run('wrong sutra'))).toBe('ok');
    expect(suggestions.create.mock.calls[0][0]).toMatchObject({ action: 'flag', note: 'wrong sutra' });
  });
});

// ─── The submitter's own ─────────────────────────────────────────────────────

describe('editOwnSuggestion and withdrawSuggestion', () => {
  it('lets the submitter change their untouched suggestion, both submitted and proposed', async () => {
    suggestions.findById.mockResolvedValue(suggestion());
    await editOwnSuggestion(editor, 's1', { proposed: { term: 'insight' } });
    expect(lastPatch()).toMatchObject({ proposed: { term: 'insight' }, submitted: { term: 'insight' } });
  });

  it('refuses once enriched, and refuses anyone else', async () => {
    suggestions.findById.mockResolvedValue(suggestion({ enrichedAt: new Date() }));
    expect(await codeOf(() => editOwnSuggestion(editor, 's1', { note: 'x' }))).toBe('locked');
    suggestions.findById.mockResolvedValue(suggestion());
    expect(await codeOf(() => editOwnSuggestion(admin, 's1', { note: 'x' }))).toBe('forbidden');
  });

  it('lets the submitter change a new term’s headword, checking it is not in the glossary yet', async () => {
    const term = { sourceTerm: '般若', translation: { term: 'wisdom' } };
    suggestions.findById.mockResolvedValue(
      suggestion({ targetKind: 'glossary_term', glossaryId: null, proposed: term, submitted: term }),
    );
    // The same headword is not looked up again.
    await editOwnSuggestion(editor, 's1', { proposed: { ...term, translation: { term: 'insight' } } });
    expect(glossaryStore.findByTerms).not.toHaveBeenCalled();
    // A new one is, and refused if taken.
    await editOwnSuggestion(editor, 's1', { proposed: { ...term, sourceTerm: '菩提' } });
    expect(glossaryStore.findByTerms).toHaveBeenCalledWith(['菩提']);
    expect(lastPatch()).toMatchObject({ proposed: { sourceTerm: '菩提' } });
    glossaryStore.findByTerms.mockResolvedValue([entry([])]);
    suggestions.updatePending.mockClear();
    const taken = () => editOwnSuggestion(editor, 's1', { proposed: { ...term, sourceTerm: '菩提' } });
    expect(await codeOf(taken)).toBe('term-exists');
    expect(suggestions.updatePending).not.toHaveBeenCalled();
  });

  it('keeps a flag from losing its note', async () => {
    suggestions.findById.mockResolvedValue(suggestion({ action: 'flag', note: 'wrong' }));
    expect(await codeOf(() => editOwnSuggestion(editor, 's1', { note: '' }))).toBe('invalid');
  });

  it('lets only the submitter withdraw', async () => {
    suggestions.findById.mockResolvedValue(suggestion({ reviewedAt: new Date() }));
    expect(await codeOf(() => withdrawSuggestion(admin, 's1'))).toBe('forbidden');
    await withdrawSuggestion(editor, 's1');
    expect(lastPatch()).toMatchObject({ status: 'withdrawn' });
  });

  it('reports a suggestion finalized meanwhile as no longer pending', async () => {
    suggestions.findById.mockResolvedValueOnce(suggestion()).mockResolvedValueOnce(suggestion({ status: 'accepted' }));
    suggestions.updatePending.mockResolvedValue(undefined);
    expect(await codeOf(() => withdrawSuggestion(editor, 's1'))).toBe('not-pending');
  });
});

// ─── Enriching and reviewing ─────────────────────────────────────────────────

describe('enrichSuggestion and reviewSuggestion', () => {
  it('lets tech enrich, keeping what was submitted', async () => {
    suggestions.findById.mockResolvedValue(suggestion());
    await enrichSuggestion(as('tech'), 's1', { term: 'wisdom', sourceName: '金剛經' });
    const patch = lastPatch();
    expect(patch).toMatchObject({ enrichedBy: 'u-tech', proposed: expect.objectContaining({ sourceName: '金剛經' }) });
    expect(patch).not.toHaveProperty('submitted');
  });

  it('checks a headword changed by enrichment', async () => {
    const term = { sourceTerm: '般若', translation: { term: 'wisdom' } };
    suggestions.findById.mockResolvedValue(
      suggestion({ targetKind: 'glossary_term', glossaryId: null, proposed: term }),
    );
    glossaryStore.findByTerms.mockResolvedValue([entry([])]);
    const run = () => enrichSuggestion(as('tech'), 's1', { ...term, sourceTerm: '菩提' });
    expect(await codeOf(run)).toBe('term-exists');
    expect(suggestions.updatePending).not.toHaveBeenCalled();
  });

  it('refuses enrichment from a leader or manager, and on a flag', async () => {
    suggestions.findById.mockResolvedValue(suggestion());
    expect(await codeOf(() => enrichSuggestion(as('leader'), 's1', { term: 'x' }))).toBe('forbidden');
    expect(await codeOf(() => enrichSuggestion(as('manager'), 's1', { term: 'x' }))).toBe('forbidden');
    suggestions.findById.mockResolvedValue(suggestion({ action: 'flag' }));
    expect(await codeOf(() => enrichSuggestion(admin, 's1', { term: 'x' }))).toBe('wrong-kind');
  });

  it('lets a leader review, not a reader', async () => {
    await reviewSuggestion(as('leader'), 's1', 'looks_right', ' fine ');
    expect(lastPatch()).toMatchObject({ reviewVerdict: 'looks_right', reviewNote: 'fine', reviewedBy: 'u-leader' });
    expect(await codeOf(() => reviewSuggestion(as('reader'), 's1', 'needs_work'))).toBe('forbidden');
  });
});

// ─── Finalizing ──────────────────────────────────────────────────────────────

describe('finalizing', () => {
  it('is for admins only', async () => {
    suggestions.findById.mockResolvedValue(suggestion());
    for (const role of ['tech', 'leader', 'editor'] as const) {
      expect(await codeOf(() => acceptSuggestion(as(role), 's1'))).toBe('forbidden');
      expect(await codeOf(() => rejectSuggestion(as(role), 's1'))).toBe('forbidden');
    }
    expect(glossaryWrites()).toBe(0);
  });

  it('rejects suggestions and dismisses flags, not the other way round', async () => {
    suggestions.findById.mockResolvedValue(suggestion({ action: 'flag' }));
    expect(await codeOf(() => rejectSuggestion(admin, 's1'))).toBe('wrong-kind');
    await dismissFlag(admin, 's1', 'fine as is');
    expect(lastPatch()).toMatchObject({ status: 'dismissed', decidedBy: 'u-admin', decisionNote: 'fine as is' });
    suggestions.findById.mockResolvedValue(suggestion());
    expect(await codeOf(() => dismissFlag(admin, 's1'))).toBe('wrong-kind');
    expect(await codeOf(() => acceptSuggestion(admin, 's1'))).not.toBe('wrong-kind');
  });

  it('refuses to accept a flag', async () => {
    suggestions.findById.mockResolvedValue(suggestion({ action: 'flag' }));
    expect(await codeOf(() => acceptSuggestion(admin, 's1'))).toBe('wrong-kind');
  });
});

describe('accepting a new term', () => {
  const newTerm = suggestion({
    targetKind: 'glossary_term',
    glossaryId: null,
    proposed: { sourceTerm: '菩提', translation: { term: 'awakening' } },
  });

  beforeEach(() => {
    suggestions.findById.mockResolvedValue(newTerm);
    glossaryService.createGlossaryAndIndexInAlgolia.mockResolvedValue([entry([], { id: 'g-new' })]);
  });

  it('creates the entry, authored by the submitter, and records it', async () => {
    const result = await acceptSuggestion(admin, 's1', { note: 'thanks' });
    const [term, translations] = glossaryService.createGlossaryAndIndexInAlgolia.mock.calls[0];
    expect(term).toMatchObject({ sourceTerm: '菩提', author: 'Ananda', createdBy: 'u-editor', updatedBy: 'u-admin' });
    expect(translations).toEqual([
      expect.objectContaining({ term: 'awakening', language: 'english', updatedBy: 'u-admin' }),
    ]);
    expect(suggestions.updatePending.mock.calls[0][1]).toMatchObject({ status: 'accepted', decisionNote: 'thanks' });
    expect(suggestions.setApplied).toHaveBeenCalledWith('s1', 'g-new');
    expect(result.appliedId).toBe('g-new');
  });

  it('revives a trashed term with that headword instead', async () => {
    glossaryStore.findByTermsIncludingTrash.mockResolvedValue([entry([], { id: 'g-old', deletedAt: new Date() })]);
    glossaryService.reviveTrashedGlossary.mockResolvedValue([entry([], { id: 'g-old' })]);
    await acceptSuggestion(admin, 's1');
    expect(glossaryService.reviveTrashedGlossary.mock.calls[0][0]).toBe('g-old');
    expect(glossaryService.createGlossaryAndIndexInAlgolia).not.toHaveBeenCalled();
  });

  it('refuses when the term was added meanwhile, without claiming it', async () => {
    glossaryStore.findByTermsIncludingTrash.mockResolvedValue([entry([])]);
    expect(await codeOf(() => acceptSuggestion(admin, 's1'))).toBe('term-exists');
    expect(suggestions.updatePending).not.toHaveBeenCalled();
  });

  it('releases its claim when the glossary write fails', async () => {
    glossaryService.createGlossaryAndIndexInAlgolia.mockRejectedValue(new Error('db down'));
    await expect(acceptSuggestion(admin, 's1')).rejects.toThrow('db down');
    expect(suggestions.releaseClaim).toHaveBeenCalledWith('s1', 'u-admin');
    expect(suggestions.setApplied).not.toHaveBeenCalled();
  });

  it('writes nothing when someone else finalized it first', async () => {
    suggestions.updatePending.mockResolvedValue(undefined);
    suggestions.findById.mockResolvedValueOnce(newTerm).mockResolvedValueOnce({ ...newTerm, status: 'accepted' });
    expect(await codeOf(() => acceptSuggestion(admin, 's1'))).toBe('not-pending');
    expect(glossaryWrites()).toBe(0);
  });
});

describe('accepting a new translation', () => {
  it('appends it to the term and records its new id', async () => {
    suggestions.findById.mockResolvedValue(suggestion());
    glossaryStore.findById.mockResolvedValue(entry([translation('t1')]));
    glossaryService.updateGlossaryTranslations.mockResolvedValue(entry([translation('t1'), translation('t-new')]));
    await acceptSuggestion(admin, 's1');
    const call = glossaryService.updateGlossaryTranslations.mock.calls[0][0];
    expect(call.translations.map((t: GlossaryTranslation) => t.term)).toEqual(['term-t1', 'wisdom']);
    expect(call.basis).toEqual(['t1']);
    expect(call).toMatchObject({
      phonetic: null,
      author: null,
      cbetaFrequency: null,
      discussion: null,
      updatedBy: 'u-admin',
    });
    expect(suggestions.setApplied).toHaveBeenCalledWith('s1', 't-new');
  });
});

describe('accepting an edit', () => {
  const edit = suggestion({
    action: 'edit',
    translationId: 't1',
    base: { term: 'wisdom', author: null, volume: '1' },
    proposed: { term: 'insight', author: 'Kumārajīva' },
  });

  beforeEach(() => suggestions.findById.mockResolvedValue(edit));

  it('applies only the changed fields to that translation', async () => {
    glossaryStore.findById.mockResolvedValue(
      entry([translation('t0'), translation('t1', { term: 'wisdom', volume: '1', discussion: 'kept' })]),
    );
    glossaryService.updateGlossaryTranslations.mockResolvedValue(entry([]));
    await acceptSuggestion(admin, 's1');
    const { translations, basis } = glossaryService.updateGlossaryTranslations.mock.calls[0][0];
    expect(basis).toEqual(['t0', 't1']);
    expect(translations[0]).toMatchObject({ id: 't0', term: 'term-t0' });
    expect(translations[1]).toMatchObject({ id: 't1', term: 'insight', author: 'Kumārajīva', discussion: 'kept' });
    expect(suggestions.setApplied).toHaveBeenCalledWith('s1', 't1');
  });

  it('stops when the translation changed since, naming the fields, until confirmed', async () => {
    glossaryStore.findById.mockResolvedValue(entry([translation('t1', { term: 'prajñā', volume: '1' })]));
    glossaryService.updateGlossaryTranslations.mockResolvedValue(entry([]));
    const error = await acceptSuggestion(admin, 's1').catch((e) => e);
    expect(error).toMatchObject({ code: 'stale', fields: ['term'] });
    expect(suggestions.updatePending).not.toHaveBeenCalled();
    await acceptSuggestion(admin, 's1', { confirmStale: true });
    expect(glossaryService.updateGlossaryTranslations).toHaveBeenCalledTimes(1);
  });

  it('is not stale when only fields the edit leaves alone changed', async () => {
    glossaryStore.findById.mockResolvedValue(entry([translation('t1', { term: 'wisdom', volume: '9' })]));
    glossaryService.updateGlossaryTranslations.mockResolvedValue(entry([]));
    expect(await codeOf(() => acceptSuggestion(admin, 's1'))).toBe('ok');
  });

  it('reports a translation removed meanwhile, and a list the store refuses, releasing the claim', async () => {
    glossaryStore.findById.mockResolvedValue(entry([translation('t0')]));
    expect(await codeOf(() => acceptSuggestion(admin, 's1'))).toBe('target-gone');
    glossaryStore.findById.mockResolvedValue(entry([translation('t1', { term: 'wisdom', volume: '1' })]));
    glossaryService.updateGlossaryTranslations.mockRejectedValue(new TranslationListError('changed'));
    expect(await codeOf(() => acceptSuggestion(admin, 's1'))).toBe('stale');
    expect(suggestions.releaseClaim).toHaveBeenCalledTimes(1);
  });
});

describe('flags, merges', () => {
  const flag = suggestion({ action: 'flag', translationId: 't1', proposed: null, note: 'wrong' });

  it('removes a flagged translation, keeping the others', async () => {
    suggestions.findById.mockResolvedValue(flag);
    glossaryStore.findById.mockResolvedValue(entry([translation('t0'), translation('t1')]));
    glossaryService.updateGlossaryTranslations.mockResolvedValue(entry([translation('t0')]));
    await removeFlaggedTranslation(admin, 's1');
    const { translations, basis } = glossaryService.updateGlossaryTranslations.mock.calls[0][0];
    expect(translations.map((t: GlossaryTranslation) => t.id)).toEqual(['t0']);
    expect(basis).toEqual(['t0', 't1']);
    expect(suggestions.setApplied).toHaveBeenCalledWith('s1', 't1');
  });

  it('refuses to remove a term’s only translation', async () => {
    suggestions.findById.mockResolvedValue(flag);
    glossaryStore.findById.mockResolvedValue(entry([translation('t1')]));
    expect(await codeOf(() => removeFlaggedTranslation(admin, 's1'))).toBe('last-translation');
    expect(glossaryWrites()).toBe(0);
  });

  it('turns a flag into a pending edit, based on the translation as it is now', async () => {
    suggestions.findById.mockResolvedValue(flag);
    glossaryStore.findById.mockResolvedValue(entry([translation('t1', { term: 'wisdom' })]));
    await flagToEdit(admin, 's1', { term: 'insight' });
    expect(lastPatch()).toMatchObject({
      action: 'edit',
      base: expect.objectContaining({ term: 'wisdom' }),
      proposed: { term: 'insight' },
    });
    expect(lastPatch()).not.toHaveProperty('status');
  });

  it('merges a suggested new term into an existing one as a pending new translation', async () => {
    suggestions.findById.mockResolvedValue(
      suggestion({
        targetKind: 'glossary_term',
        glossaryId: null,
        proposed: { sourceTerm: '般若', translation: { term: 'prajñā' } },
      }),
    );
    glossaryStore.findById.mockResolvedValue(entry([]));
    await mergeIntoTerm(admin, 's1', 'g1');
    expect(lastPatch()).toMatchObject({
      targetKind: 'glossary_translation',
      glossaryId: 'g1',
      proposed: expect.objectContaining({ term: 'prajñā', language: 'english' }),
    });
    expect(glossaryWrites()).toBe(0);
  });
});
