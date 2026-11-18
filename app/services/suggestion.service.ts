// Glossary suggestions: every operation of their lifecycle (docs/plans/glossary-suggestions.md).
// Routes call these and map a SuggestionError's code to a response; the rules themselves are in
// suggestion.rules.ts, the storage in suggestion.store.ts.
//
//   submit ─▶ pending ──(edit own · enrich · mark ready · review: any order, all optional)──┐
//                │                                                                         ├─▶ accepted
//                └─▶ withdrawn (submitter)                                                 ├─▶ rejected
//                                                                                          └─▶ dismissed (flags)
//
// Accepting writes to the glossary through the existing glossary service, so search indexing
// works as for any other write. It claims the suggestion first (status → accepted, only if still
// pending), then applies it: two admins accepting at once cannot both apply it. If the apply
// fails, the claim is released and the suggestion is pending again.
import { type z } from 'zod';

import { type ReadSuggestion } from '~/drizzle/tables';
import { type ReviewVerdict } from '~/utils/constants';
import {
  noteSchema,
  proposedEditSchema,
  proposedTermSchema,
  proposedTranslationSchema,
  suggestionContextSchema,
  type ProposedEdit,
  type ProposedTerm,
  type ProposedTranslation,
} from '~/validations/suggestion.validation';

import { TranslationListError } from './glossary.diff';
import { createGlossaryAndIndexInAlgolia, reviveTrashedGlossary, updateGlossaryTranslations } from './glossary.service';
import { GlossaryStore } from './glossary.store';
import { type GlossaryEntry, type GlossaryTranslation } from './glossary.types';
import {
  applyEdit,
  assertMay,
  assertPending,
  assertSubmitterMayEdit,
  assertSubmitterMayWithdraw,
  changedFields,
  snapshotOf,
  staleFields,
  SuggestionError,
  type SuggestionUser,
  type TranslationSnapshot,
} from './suggestion.rules';
import { SuggestionStore } from './suggestion.store';
import { readUsers } from './user.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const parse = <T extends z.ZodTypeAny>(schema: T, value: unknown): z.output<T> => {
  const result = schema.safeParse(value);
  if (!result.success) throw new SuggestionError('invalid', result.error.issues[0]?.message ?? 'Invalid suggestion.');
  return result.data;
};

const load = async (id: string): Promise<ReadSuggestion> => {
  const suggestion = await SuggestionStore.findById(id);
  if (!suggestion) throw new SuggestionError('not-found', 'Suggestion not found.');
  return suggestion;
};

// Writes `patch` if the suggestion is still pending; otherwise says why not.
const updatePending = async (
  id: string,
  patch: Parameters<typeof SuggestionStore.updatePending>[1],
): Promise<ReadSuggestion> => {
  const row = await SuggestionStore.updatePending(id, patch);
  if (row) return row;
  // Someone else finalized or withdrew it in the meantime (or it never existed).
  assertPending(await load(id));
  throw new SuggestionError('not-pending', 'This suggestion is no longer pending.');
};

const liveEntry = async (glossaryId: string | null): Promise<GlossaryEntry> => {
  const entry = glossaryId ? await GlossaryStore.findById(glossaryId) : undefined;
  if (!entry) throw new SuggestionError('target-gone', 'The glossary entry no longer exists.');
  return entry;
};

const storedTranslation = (entry: GlossaryEntry, translationId: string | null): GlossaryTranslation => {
  const translation = translationId ? entry.translations.find((t) => t.id === translationId) : undefined;
  if (!translation) throw new SuggestionError('target-gone', 'The translation no longer exists.');
  return translation;
};

// The proposal of a suggestion of this kind, checked. Flags have none.
const parseProposal = (suggestion: Pick<ReadSuggestion, 'targetKind' | 'action'>, value: unknown) => {
  if (suggestion.targetKind === 'glossary_term') return parse(proposedTermSchema, value);
  if (suggestion.action === 'create') return parse(proposedTranslationSchema, value);
  if (suggestion.action === 'edit') return parse(proposedEditSchema, value);
  throw new SuggestionError('wrong-kind', 'A flag has no values to change.');
};

// An edit must change something, compared with the translation as it was when suggested.
const assertChanges = (base: Partial<TranslationSnapshot>, edit: ProposedEdit) => {
  if (!changedFields(base, edit).length) {
    throw new SuggestionError('nothing-changed', 'The suggestion is the same as the current translation.');
  }
};

// Writes the term's translations as `translations`, built from `basis`. A list the term no
// longer fits (someone changed it meanwhile) is reported as stale, not as a server fault.
const writeTranslations = async (
  entry: GlossaryEntry,
  translations: GlossaryTranslation[],
  basis: string[],
  by: string,
): Promise<GlossaryEntry> => {
  try {
    const saved = await updateGlossaryTranslations({
      id: entry.id,
      // null leaves the term's own columns as they are.
      phonetic: null,
      author: null,
      cbetaFrequency: null,
      discussion: null,
      translations,
      updatedBy: by,
      basis,
    });
    if (!saved) throw new SuggestionError('target-gone', 'The glossary entry no longer exists.');
    return saved;
  } catch (error) {
    if (error instanceof TranslationListError) {
      throw new SuggestionError('stale', 'The entry was changed meanwhile. Reload it and try again.');
    }
    throw error;
  }
};

// A proposed translation as a glossary translation, last edited by `by`. Blank stays blank: no
// placeholder source or section (PR 9).
export const translationFromProposal = (proposal: ProposedTranslation, by: string): GlossaryTranslation => ({
  term: proposal.term,
  language: proposal.language,
  sourceName: proposal.sourceName ?? '',
  volume: proposal.volume ?? '',
  sourceText: proposal.sourceText ?? '',
  targetText: proposal.targetText ?? '',
  author: proposal.author ?? '',
  partOfSpeech: proposal.partOfSpeech ?? '',
  phonetic: proposal.phonetic ?? '',
  discussion: proposal.discussion ?? null,
  updatedBy: by,
  updatedAt: new Date().toISOString(),
});

// ─── Submitting (anyone signed in) ───────────────────────────────────────────

// The values are unknown (from a request): each is checked here, by the schema for its kind.
export type SubmitInput =
  | { kind: 'new-term'; proposed?: unknown; note?: unknown; context?: unknown }
  | { kind: 'new-translation'; glossaryId: string; proposed?: unknown; note?: unknown; context?: unknown }
  | { kind: 'edit'; glossaryId: string; translationId: string; proposed?: unknown; note?: unknown; context?: unknown }
  | { kind: 'flag'; glossaryId: string; translationId: string; note?: unknown; context?: unknown };

export const submitSuggestion = async (user: SuggestionUser, input: SubmitInput): Promise<ReadSuggestion> => {
  const note = parse(noteSchema, input.note);
  const context = parse(suggestionContextSchema, input.context);
  const audit = { note, context, createdBy: user.id, updatedBy: user.id };

  if (input.kind === 'new-term') {
    const proposed = parse(proposedTermSchema, input.proposed);
    const [existing] = await GlossaryStore.findByTerms([proposed.sourceTerm]);
    if (existing) {
      throw new SuggestionError(
        'term-exists',
        `“${proposed.sourceTerm}” is already in the glossary. Suggest a translation for it instead.`,
        { glossaryId: existing.id },
      );
    }
    return SuggestionStore.create({
      targetKind: 'glossary_term',
      action: 'create',
      submitted: proposed,
      proposed,
      ...audit,
    });
  }

  const entry = await liveEntry(input.glossaryId);

  if (input.kind === 'new-translation') {
    const proposed = parse(proposedTranslationSchema, input.proposed);
    return SuggestionStore.create({
      targetKind: 'glossary_translation',
      action: 'create',
      glossaryId: entry.id,
      submitted: proposed,
      proposed,
      ...audit,
    });
  }

  const base = snapshotOf(storedTranslation(entry, input.translationId));
  const target = {
    targetKind: 'glossary_translation' as const,
    glossaryId: entry.id,
    translationId: input.translationId,
    base,
  };

  if (input.kind === 'edit') {
    const proposed = parse(proposedEditSchema, input.proposed);
    assertChanges(base, proposed);
    return SuggestionStore.create({ ...target, action: 'edit', submitted: proposed, proposed, ...audit });
  }

  // A flag is a note and nothing else, so the note is required.
  if (!note) throw new SuggestionError('invalid', 'Say what is wrong with this translation.');
  return SuggestionStore.create({ ...target, action: 'flag', ...audit });
};

// ─── The submitter's own suggestion ──────────────────────────────────────────

export const editOwnSuggestion = async (
  user: SuggestionUser,
  id: string,
  changes: { proposed?: unknown; note?: unknown },
): Promise<ReadSuggestion> => {
  const suggestion = await load(id);
  assertSubmitterMayEdit(suggestion, user);
  const patch: Parameters<typeof SuggestionStore.updatePending>[1] = { updatedBy: user.id };
  if (changes.note !== undefined) {
    patch.note = parse(noteSchema, changes.note);
    if (suggestion.action === 'flag' && !patch.note) {
      throw new SuggestionError('invalid', 'Say what is wrong with this translation.');
    }
  }
  if (changes.proposed !== undefined) {
    const proposed = parseProposal(suggestion, changes.proposed);
    if (suggestion.action === 'edit') assertChanges(suggestion.base ?? {}, proposed as ProposedEdit);
    // Nobody has worked on it yet, so what was submitted is still all the submitter's own.
    patch.proposed = proposed;
    patch.submitted = proposed;
  }
  return updatePending(id, patch);
};

export const withdrawSuggestion = async (user: SuggestionUser, id: string): Promise<ReadSuggestion> => {
  assertSubmitterMayWithdraw(await load(id), user);
  return updatePending(id, { status: 'withdrawn', updatedBy: user.id });
};

// ─── Enriching (tech, admin) ─────────────────────────────────────────────────

// Replaces the proposal with a fuller one. `submitted` keeps what the submitter wrote.
export const enrichSuggestion = async (
  user: SuggestionUser,
  id: string,
  proposed: unknown,
): Promise<ReadSuggestion> => {
  assertMay(user, 'enrich');
  const suggestion = await load(id);
  assertPending(suggestion);
  const value = parseProposal(suggestion, proposed);
  if (suggestion.action === 'edit') assertChanges(suggestion.base ?? {}, value as ProposedEdit);
  return updatePending(id, { proposed: value, enrichedBy: user.id, enrichedAt: new Date(), updatedBy: user.id });
};

// "Ready for review": information for reviewers, set or cleared.
export const setSuggestionReady = async (user: SuggestionUser, id: string, ready: boolean): Promise<ReadSuggestion> => {
  assertMay(user, 'enrich');
  return updatePending(
    id,
    ready
      ? { readyBy: user.id, readyAt: new Date(), updatedBy: user.id }
      : { readyBy: null, readyAt: null, updatedBy: user.id },
  );
};

// ─── Reviewing (leader, admin) ───────────────────────────────────────────────

// The latest review replaces any earlier one.
export const reviewSuggestion = async (
  user: SuggestionUser,
  id: string,
  verdict: ReviewVerdict,
  note?: unknown,
): Promise<ReadSuggestion> => {
  assertMay(user, 'review');
  return updatePending(id, {
    reviewVerdict: verdict,
    reviewNote: parse(noteSchema, note),
    reviewedBy: user.id,
    reviewedAt: new Date(),
    updatedBy: user.id,
  });
};

// ─── Finalizing (admin) ──────────────────────────────────────────────────────

const decision = (user: SuggestionUser, note: unknown) => ({
  decidedBy: user.id,
  decidedAt: new Date(),
  decisionNote: parse(noteSchema, note),
  updatedBy: user.id,
});

export const rejectSuggestion = async (user: SuggestionUser, id: string, note?: unknown): Promise<ReadSuggestion> => {
  assertMay(user, 'finalize');
  const suggestion = await load(id);
  if (suggestion.action === 'flag') throw new SuggestionError('wrong-kind', 'A flag is dismissed, not rejected.');
  return updatePending(id, { status: 'rejected', ...decision(user, note) });
};

export const dismissFlag = async (user: SuggestionUser, id: string, note?: unknown): Promise<ReadSuggestion> => {
  assertMay(user, 'finalize');
  const suggestion = await load(id);
  if (suggestion.action !== 'flag') throw new SuggestionError('wrong-kind', 'Only a flag can be dismissed.');
  return updatePending(id, { status: 'dismissed', ...decision(user, note) });
};

// A new term whose headword turned out to be in the glossary already becomes a new translation
// of that term. It stays pending, to be accepted as one.
export const mergeIntoTerm = async (user: SuggestionUser, id: string, glossaryId: string): Promise<ReadSuggestion> => {
  assertMay(user, 'finalize');
  const suggestion = await load(id);
  assertPending(suggestion);
  if (suggestion.targetKind !== 'glossary_term') {
    throw new SuggestionError('wrong-kind', 'Only a suggested new term can be merged into an existing one.');
  }
  const entry = await liveEntry(glossaryId);
  const { translation } = parse(proposedTermSchema, suggestion.proposed);
  return updatePending(id, {
    targetKind: 'glossary_translation',
    glossaryId: entry.id,
    proposed: translation,
    updatedBy: user.id,
  });
};

// A flag becomes an edit of the flagged translation, keeping its note; it stays pending, to be
// accepted as one. Its base is the translation as it is now.
export const flagToEdit = async (user: SuggestionUser, id: string, proposed: unknown): Promise<ReadSuggestion> => {
  assertMay(user, 'finalize');
  const suggestion = await load(id);
  assertPending(suggestion);
  if (suggestion.action !== 'flag') throw new SuggestionError('wrong-kind', 'Only a flag can be turned into an edit.');
  const base = snapshotOf(storedTranslation(await liveEntry(suggestion.glossaryId), suggestion.translationId));
  const edit = parse(proposedEditSchema, proposed);
  assertChanges(base, edit);
  return updatePending(id, { action: 'edit', base, proposed: edit, updatedBy: user.id });
};

// Claims the suggestion (accepted, if still pending), runs `apply`, records what it created or
// changed. If `apply` throws, the claim is released and the error passed on.
const claimAndApply = async (
  user: SuggestionUser,
  id: string,
  note: unknown,
  apply: () => Promise<string>,
): Promise<ReadSuggestion> => {
  const claimed = await updatePending(id, { status: 'accepted', ...decision(user, note) });
  let appliedId: string;
  try {
    appliedId = await apply();
  } catch (error) {
    await SuggestionStore.releaseClaim(id, user.id);
    throw error;
  }
  // The glossary change has happened; failing to record its id must not reopen the suggestion.
  try {
    await SuggestionStore.setApplied(id, appliedId);
  } catch (error) {
    console.error('Accepted suggestion but could not record what it applied', id, appliedId, error);
  }
  return { ...claimed, appliedId };
};

// Removes the flagged translation for good (translations have no trash; the term-level trash
// takes the whole entry). The flag keeps the translation's content in its base. Refused for a
// term's last translation: trash the term instead.
export const removeFlaggedTranslation = async (
  user: SuggestionUser,
  id: string,
  note?: unknown,
): Promise<ReadSuggestion> => {
  assertMay(user, 'finalize');
  const suggestion = await load(id);
  assertPending(suggestion);
  if (suggestion.action !== 'flag')
    throw new SuggestionError('wrong-kind', 'Only a flagged translation can be removed this way.');
  const entry = await liveEntry(suggestion.glossaryId);
  const target = storedTranslation(entry, suggestion.translationId);
  if (entry.translations.length === 1) {
    throw new SuggestionError(
      'last-translation',
      'This is the entry’s only translation. Move the whole entry to the trash instead.',
    );
  }
  const basis = entry.translations.flatMap((t) => t.id ?? []);
  return claimAndApply(user, id, note, async () => {
    await writeTranslations(
      entry,
      entry.translations.filter((t) => t.id !== target.id),
      basis,
      user.id,
    );
    return target.id!;
  });
};

const submitterName = async (userId: string): Promise<string | null> => {
  const users = await readUsers();
  return users.find((u) => u.id === userId)?.username ?? null;
};

const acceptNewTerm = async (user: SuggestionUser, suggestion: ReadSuggestion, note: unknown) => {
  const proposal: ProposedTerm = parse(proposedTermSchema, suggestion.proposed);
  // The unique index covers the trash, so a trashed row with this headword is revived instead.
  const [existing] = await GlossaryStore.findByTermsIncludingTrash([proposal.sourceTerm]);
  if (existing && !existing.deletedAt) {
    throw new SuggestionError(
      'term-exists',
      `“${proposal.sourceTerm}” is already in the glossary. Merge this suggestion into it instead.`,
      { glossaryId: existing.id },
    );
  }
  // The term's author is who created the entry: the submitter (see the glossary author semantics).
  const term = {
    sourceTerm: proposal.sourceTerm,
    phonetic: proposal.phonetic,
    author: (await submitterName(suggestion.createdBy)) || '翻譯團隊',
    cbetaFrequency: proposal.cbetaFrequency || '0',
    discussion: '',
    updatedBy: user.id,
  };
  const translations = [translationFromProposal(proposal.translation, user.id)];
  return claimAndApply(user, suggestion.id, note, async () => {
    const [entry] = existing
      ? await reviveTrashedGlossary(existing.id, term, translations)
      : await createGlossaryAndIndexInAlgolia({ ...term, createdBy: suggestion.createdBy }, translations);
    return entry.id;
  });
};

const acceptNewTranslation = async (user: SuggestionUser, suggestion: ReadSuggestion, note: unknown) => {
  const proposal = parse(proposedTranslationSchema, suggestion.proposed);
  const entry = await liveEntry(suggestion.glossaryId);
  const basis = entry.translations.flatMap((t) => t.id ?? []);
  return claimAndApply(user, suggestion.id, note, async () => {
    const saved = await writeTranslations(
      entry,
      [...entry.translations, translationFromProposal(proposal, user.id)],
      basis,
      user.id,
    );
    // The new one is the only id the term did not have before. Translations added by someone
    // else meanwhile are kept after it, so take the first new id.
    const added = saved.translations.find((t) => t.id && !basis.includes(t.id));
    if (!added?.id) throw new Error('The new translation was not saved.');
    return added.id;
  });
};

const acceptEdit = async (user: SuggestionUser, suggestion: ReadSuggestion, note: unknown, confirmStale: boolean) => {
  const edit = parse(proposedEditSchema, suggestion.proposed);
  const base = (suggestion.base ?? {}) as Partial<TranslationSnapshot>;
  const entry = await liveEntry(suggestion.glossaryId);
  const current = storedTranslation(entry, suggestion.translationId);
  const changed = changedFields(base, edit);
  if (!changed.length) {
    throw new SuggestionError('nothing-changed', 'The suggestion is the same as the current translation.');
  }
  const stale = staleFields(base, snapshotOf(current), changed);
  if (stale.length && !confirmStale) {
    throw new SuggestionError(
      'stale',
      'The translation was changed after this suggestion was made. Compare the versions and confirm.',
      { fields: stale },
    );
  }
  const basis = entry.translations.flatMap((t) => t.id ?? []);
  const next = applyEdit(current, edit, changed, user.id);
  return claimAndApply(user, suggestion.id, note, async () => {
    await writeTranslations(
      entry,
      entry.translations.map((t) => (t.id === current.id ? next : t)),
      basis,
      user.id,
    );
    return current.id!;
  });
};

// Applies the suggestion to the glossary. For an edit whose translation changed since the
// suggestion was made, `confirmStale` says the admin has compared the versions and accepts
// overwriting the fields both changed (otherwise a 'stale' error lists them).
export const acceptSuggestion = async (
  user: SuggestionUser,
  id: string,
  { note, confirmStale = false }: { note?: unknown; confirmStale?: boolean } = {},
): Promise<ReadSuggestion> => {
  assertMay(user, 'finalize');
  const suggestion = await load(id);
  assertPending(suggestion);
  if (suggestion.targetKind === 'glossary_term') return acceptNewTerm(user, suggestion, note);
  if (suggestion.action === 'create') return acceptNewTranslation(user, suggestion, note);
  if (suggestion.action === 'edit') return acceptEdit(user, suggestion, note, confirmStale);
  throw new SuggestionError('wrong-kind', 'A flag is dismissed, turned into an edit, or its translation removed.');
};

// ─── Reading ─────────────────────────────────────────────────────────────────

export const readSuggestion = (id: string) => load(id);
export const listSuggestions = SuggestionStore.list;
export const readPendingSuggestionsForGlossaries = SuggestionStore.findPendingByGlossaryIds;
export const searchPendingNewTerms = SuggestionStore.findPendingNewTerms;
export const readSuggestionHistory = SuggestionStore.findByGlossaryId;
