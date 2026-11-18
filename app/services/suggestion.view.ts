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
