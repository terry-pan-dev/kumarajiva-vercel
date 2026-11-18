// The rules of glossary suggestions (docs/plans/glossary-suggestions.md): who may do what to a
// suggestion, and how an edit compares with the translation it changes. Pure (no database), so
// every rule is unit-tested directly; suggestion.service.ts applies them.
//
// Jobs and the permissions they take (the existing subjects, no new one):
//   suggest, flag, edit or withdraw one's own   anyone signed in
//   enrich, mark ready                          GlossaryData Maintain  (tech, admin)
//   review                                      Glossary Update        (leader, admin)
//   finalize: accept, reject, dismiss, merge,   Glossary Administrate  (admin)
//     turn a flag into an edit, remove a flagged translation
import { defineAbilityFor } from '~/authorisation';
import { type ReadSuggestion, type ReadUser } from '~/drizzle/tables';
import { TRANSLATION_CONTENT_FIELDS, type ProposedEdit } from '~/validations/suggestion.validation';

import { type GlossaryTranslation } from './glossary.types';

export type SuggestionUser = Pick<ReadUser, 'id' | 'role'> & { username?: string | null };

// Why an operation on a suggestion was refused. Routes map the code to an HTTP status.
export type SuggestionErrorCode =
  | 'forbidden' // the user may not do this
  | 'not-found' // no such suggestion
  | 'not-pending' // already accepted, rejected, withdrawn or dismissed
  | 'locked' // the submitter can no longer edit it: someone has enriched or reviewed it
  | 'wrong-kind' // e.g. dismissing something that is not a flag
  | 'invalid' // the values do not fit the kind
  | 'nothing-changed' // an edit identical to the stored translation
  | 'target-gone' // the term or translation it is about no longer exists
  | 'term-exists' // a new term whose headword is already in the glossary
  | 'stale' // the stored translation changed since the suggestion was made
  | 'last-translation'; // removing it would leave the term without a translation

export class SuggestionError extends Error {
  name = 'SuggestionError';
  constructor(
    readonly code: SuggestionErrorCode,
    message: string,
    // For 'stale': the fields that changed on both sides.
    readonly fields?: readonly string[],
  ) {
    super(message);
  }
}

// ─── Permissions ─────────────────────────────────────────────────────────────

export const canEnrich = (user: SuggestionUser) => defineAbilityFor(user).can('Maintain', 'GlossaryData');
export const canReview = (user: SuggestionUser) => defineAbilityFor(user).can('Update', 'Glossary');
export const canFinalize = (user: SuggestionUser) => defineAbilityFor(user).can('Administrate', 'Glossary');

type Job = 'enrich' | 'review' | 'finalize';
const ALLOWED: Record<Job, (user: SuggestionUser) => boolean> = {
  enrich: canEnrich,
  review: canReview,
  finalize: canFinalize,
};

export const assertMay = (user: SuggestionUser, job: Job) => {
  if (!ALLOWED[job](user)) throw new SuggestionError('forbidden', `You are not allowed to ${job} suggestions.`);
};

// ─── State ───────────────────────────────────────────────────────────────────

type SuggestionState = Pick<ReadSuggestion, 'status' | 'createdBy' | 'enrichedAt' | 'reviewedAt'>;

// Only a pending suggestion changes; the others are history.
export const assertPending = (suggestion: Pick<ReadSuggestion, 'status'>) => {
  if (suggestion.status !== 'pending') {
    throw new SuggestionError('not-pending', `This suggestion is already ${suggestion.status}.`);
  }
};

// The submitter may edit their suggestion until someone has worked on it: after an enrichment
// or a review, a change underneath would make that work describe something else. They can
// still withdraw it.
export const assertSubmitterMayEdit = (suggestion: SuggestionState, user: SuggestionUser) => {
  assertPending(suggestion);
  if (suggestion.createdBy !== user.id) {
    throw new SuggestionError('forbidden', 'Only the person who made a suggestion can change it.');
  }
  if (suggestion.enrichedAt || suggestion.reviewedAt) {
    throw new SuggestionError(
      'locked',
      'This suggestion has been worked on and can no longer be changed. Withdraw it instead.',
    );
  }
};

export const assertSubmitterMayWithdraw = (suggestion: SuggestionState, user: SuggestionUser) => {
  assertPending(suggestion);
  if (suggestion.createdBy !== user.id) {
    throw new SuggestionError('forbidden', 'Only the person who made a suggestion can withdraw it.');
  }
};

// ─── Translation snapshots and edits ─────────────────────────────────────────

export type TranslationSnapshot = Record<(typeof TRANSLATION_CONTENT_FIELDS)[number], string | null>;

// What a stored translation says, as stored in a suggestion's `base`: its content fields only,
// absent read as null, so two snapshots compare field by field.
export const snapshotOf = (translation: GlossaryTranslation): TranslationSnapshot =>
  Object.fromEntries(
    TRANSLATION_CONTENT_FIELDS.map((field) => [field, (translation[field] as string | null | undefined) ?? null]),
  ) as TranslationSnapshot;

// Blank and null are the same: both are "not given".
const same = (a: unknown, b: unknown) => (a || null) === (b || null);

// The fields an edit really changes: those whose proposed value differs from `base`.
export const changedFields = (base: Partial<TranslationSnapshot>, edit: ProposedEdit): string[] =>
  Object.entries(edit)
    .filter(([field, value]) => !same(value, base[field as keyof TranslationSnapshot]))
    .map(([field]) => field);

// Of the fields an edit changes, those that have also changed in the stored translation since
// the suggestion was made. Accepting would overwrite someone else's change to them.
export const staleFields = (
  base: Partial<TranslationSnapshot>,
  current: TranslationSnapshot,
  changed: readonly string[],
): string[] =>
  changed.filter(
    (field) => !same(base[field as keyof TranslationSnapshot], current[field as keyof TranslationSnapshot]),
  );

// The stored translation with the edit's changed fields applied, as the last edit of `by`.
// A cleared optional field is stored as null; the rendering is never cleared (the schema
// refuses a blank one). sourceName and volume are never null in storage, so cleared is ''.
export const applyEdit = (
  current: GlossaryTranslation,
  edit: ProposedEdit,
  changed: readonly string[],
  by: string,
): GlossaryTranslation => {
  const next: GlossaryTranslation = { ...current, updatedBy: by, updatedAt: new Date().toISOString() };
  for (const field of changed) {
    const value = edit[field as keyof ProposedEdit] ?? null;
    if (field === 'sourceName' || field === 'volume') next[field] = value ?? '';
    else if (field === 'term') next.term = value ?? current.term;
    else (next as Record<string, unknown>)[field] = value;
  }
  return next;
};
