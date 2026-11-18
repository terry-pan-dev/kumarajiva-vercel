// What the glossary page shows of a pending suggestion (docs/plans/glossary-suggestions.md,
// step 6). Pure and client-safe (types only), so the card and the server share the shape.
//
// Everyone sees that a suggestion is pending, who made it and when. What else depends on its
// kind:
// - a new term or a new translation shows its proposed values, marked as under review;
// - a change request on a stored translation (action `flag`, or an `edit` an admin made of one)
//   is only marked "under review": its note is free text, not values that could be shown in
//   place, so the card can't say what the change is.
// The submitter's note is shown to the submitter alone, with their edit and withdraw controls.
// There are no review controls: leaders review informally (user, 2026-11-18).
import { type ReadSuggestion } from '~/drizzle/tables';
import { type SuggestionAction, type SuggestionTarget } from '~/utils/constants';
import { type ProposedTerm, type ProposedTranslation } from '~/validations/suggestion.validation';

export type PendingSuggestionView = {
  id: string;
  targetKind: SuggestionTarget;
  action: SuggestionAction;
  glossaryId: string | null;
  translationId: string | null;
  // The proposal of a new term or translation; null for a change to a stored translation.
  proposed: ProposedTerm | ProposedTranslation | null;
  submitter: string;
  // ISO timestamp.
  createdAt: string;
  mine: boolean;
  // The submitter may still change it: nobody has enriched or reviewed it yet.
  editable: boolean;
  // The submitter's note, for the submitter only.
  note: string | null;
};

type ViewSource = Pick<
  ReadSuggestion,
  | 'id'
  | 'status'
  | 'targetKind'
  | 'action'
  | 'glossaryId'
  | 'translationId'
  | 'proposed'
  | 'note'
  | 'createdAt'
  | 'createdBy'
  | 'enrichedAt'
  | 'reviewedAt'
>;

export const pendingSuggestionView = (
  row: ViewSource,
  viewerId: string,
  names: ReadonlyMap<string, string>,
): PendingSuggestionView => {
  const mine = row.createdBy === viewerId;
  return {
    id: row.id,
    targetKind: row.targetKind,
    action: row.action,
    glossaryId: row.glossaryId,
    translationId: row.translationId,
    proposed: row.action === 'create' ? ((row.proposed as PendingSuggestionView['proposed']) ?? null) : null,
    submitter: names.get(row.createdBy) ?? 'someone',
    createdAt: row.createdAt.toISOString(),
    mine,
    editable: mine && row.status === 'pending' && !row.enrichedAt && !row.reviewedAt,
    note: mine ? row.note : null,
  };
};

// The card's three groups: new translations of the entry, and the changes under review on each
// of its stored translations (by translation id).
export const groupPendingForEntry = (views: readonly PendingSuggestionView[]) => {
  const newTranslations: PendingSuggestionView[] = [];
  const changesByTranslation = new Map<string, PendingSuggestionView[]>();
  for (const view of views) {
    if (view.targetKind !== 'glossary_translation') continue;
    if (view.action === 'create') {
      newTranslations.push(view);
    } else if (view.translationId) {
      const list = changesByTranslation.get(view.translationId) ?? [];
      list.push(view);
      changesByTranslation.set(view.translationId, list);
    }
  }
  return { newTranslations, changesByTranslation };
};

// ─── The Data Management queue (step 7) ──────────────────────────────────────

// What a suggestion is, in the queue's words. A note-only suggestion on a stored translation
// (action `flag`) is a "change request" (user, 2026-11-18).
export const SUGGESTION_KINDS = ['new-term', 'new-translation', 'change-request', 'edit'] as const;
export type SuggestionKind = (typeof SUGGESTION_KINDS)[number];

export const suggestionKind = (row: Pick<ReadSuggestion, 'targetKind' | 'action'>): SuggestionKind => {
  if (row.targetKind === 'glossary_term') return 'new-term';
  if (row.action === 'create') return 'new-translation';
  if (row.action === 'flag') return 'change-request';
  return 'edit';
};

// The columns a kind is stored as, for filtering.
export const KIND_COLUMNS: Record<SuggestionKind, { targetKind: SuggestionTarget; action: SuggestionAction }> = {
  'new-term': { targetKind: 'glossary_term', action: 'create' },
  'new-translation': { targetKind: 'glossary_translation', action: 'create' },
  'change-request': { targetKind: 'glossary_translation', action: 'flag' },
  edit: { targetKind: 'glossary_translation', action: 'edit' },
};

// A translation's optional content: what enrichers fill in.
const OPTIONAL_FIELDS = [
  'sourceName',
  'volume',
  'sourceText',
  'targetText',
  'author',
  'partOfSpeech',
  'phonetic',
  'discussion',
] as const;

const proposedTranslationOf = (row: Pick<ReadSuggestion, 'targetKind' | 'action' | 'proposed'>) => {
  if (row.action !== 'create' || !row.proposed) return null;
  const proposed = row.proposed as Partial<ProposedTerm> & Partial<ProposedTranslation>;
  return (row.targetKind === 'glossary_term' ? proposed.translation : proposed) ?? null;
};

// How many of a proposed translation's optional fields are filled in; null for change requests
// and edits, which have no translation of their own.
export const completeness = (
  row: Pick<ReadSuggestion, 'targetKind' | 'action' | 'proposed'>,
): { filled: number; total: number } | null => {
  const translation = proposedTranslationOf(row) as Record<string, unknown> | null;
  if (!translation) return null;
  const filled = OPTIONAL_FIELDS.filter((field) => {
    const value = translation[field];
    return typeof value === 'string' && value.trim() !== '';
  }).length;
  return { filled, total: OPTIONAL_FIELDS.length };
};

export const proposedRendering = (row: Pick<ReadSuggestion, 'targetKind' | 'action' | 'proposed'>) =>
  proposedTranslationOf(row)?.term ?? null;

// One row of the queue.
export type QueueItem = {
  id: string;
  kind: SuggestionKind;
  status: ReadSuggestion['status'];
  // The term it is about: the proposed headword of a new term, else the entry's (null if the
  // entry is gone).
  headword: string | null;
  rendering: string | null;
  submitter: string;
  createdAt: string;
  completeness: { filled: number; total: number } | null;
  ready: boolean;
};

// An edit compared field by field: what it was suggested against (base), what is stored now
// (current) and what it proposes. `stale`: the stored value changed since, so accepting
// overwrites someone else's change.
export type FieldComparison = {
  field: string;
  base: string | null;
  current: string | null;
  proposed: string | null;
  stale: boolean;
};

const norm = (value: unknown) => (typeof value === 'string' && value !== '' ? value : null);

export const compareEdit = (
  base: Record<string, unknown>,
  current: Record<string, unknown>,
  edit: Record<string, unknown>,
): FieldComparison[] =>
  Object.keys(edit)
    .filter((field) => edit[field] !== undefined && norm(edit[field]) !== norm(base[field]))
    .map((field) => ({
      field,
      base: norm(base[field]),
      current: norm(current[field]),
      proposed: norm(edit[field]),
      stale: norm(current[field]) !== norm(base[field]),
    }));
