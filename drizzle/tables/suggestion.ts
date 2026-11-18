import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { auditAtFields, auditByFields } from '../audit';
import { reviewVerdictEnum, suggestionActionEnum, suggestionStatusEnum, suggestionTargetEnum } from './enums';
import { glossariesTable, glossaryTranslationsTable } from './glossary';

// A proposed change from the everyday glossary: a new term, a new translation, an edit or a flag.
// It shows in the glossary as under review until an admin finalizes it, and the row stays as the
// entry's history afterwards (rows are never deleted). See docs/plans/glossary-suggestions.md.
//
// Which target columns are set depends on target_kind and action (new term: none; new
// translation: glossary_id; edit and flag: both). That is enforced in code, not by a CHECK:
// `set null` on a purged target would break one, and history must outlive its target.
export const suggestionsTable = pgTable(
  'suggestions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    targetKind: suggestionTargetEnum('target_kind').notNull(),
    action: suggestionActionEnum('action').notNull(),
    status: suggestionStatusEnum('status').notNull().default('pending'),

    // One nullable FK per kind of target rather than one polymorphic id, so they are real keys.
    // Later: paragraph_id → paragraphs_new, when translation paragraphs get suggestions.
    glossaryId: uuid('glossary_id').references(() => glossariesTable.id, { onDelete: 'set null' }),
    translationId: uuid('translation_id').references(() => glossaryTranslationsTable.id, {
      onDelete: 'set null',
    }),

    // Field values; each shape is checked by a zod schema per target kind.
    // The target's fields when the suggestion was made (edit, flag): what an edit is compared
    // against, to show the change and to notice the target changed since.
    base: jsonb('base').$type<Record<string, unknown>>(),
    // What the submitter entered. Never changes, so history shows it beside what enrichers added.
    submitted: jsonb('submitted').$type<Record<string, unknown>>(),
    // The current proposal: starts as `submitted`, enrichers edit it, accepting applies it.
    proposed: jsonb('proposed').$type<Record<string, unknown>>(),
    // The submitter's free note. Review history only: never copied into a discussion field.
    note: text('note'),
    // Where it was made, e.g. { documentId, sectionId, paragraphId, page } from the working document.
    context: jsonb('context').$type<Record<string, unknown>>(),

    enrichedBy: text('enriched_by'),
    enrichedAt: timestamp('enriched_at'),
    // "Ready for review": information for reviewers, never required.
    readyBy: text('ready_by'),
    readyAt: timestamp('ready_at'),
    // The latest leader review only; a second review overwrites the first.
    reviewVerdict: reviewVerdictEnum('review_verdict'),
    reviewNote: text('review_note'),
    reviewedBy: text('reviewed_by'),
    reviewedAt: timestamp('reviewed_at'),
    decidedBy: text('decided_by'),
    decidedAt: timestamp('decided_at'),
    decisionNote: text('decision_note'),
    // The term or translation created or changed on accept.
    appliedId: uuid('applied_id'),

    // created_at / created_by: when and by whom it was submitted. deleted_at is unused.
    ...auditAtFields,
    ...auditByFields,
  },
  (t) => [
    index('suggestions_status_idx').on(t.status),
    index('suggestions_glossary_id_idx').on(t.glossaryId),
    index('suggestions_translation_id_idx').on(t.translationId),
  ],
);

export type ReadSuggestion = typeof suggestionsTable.$inferSelect;
export type CreateSuggestion = typeof suggestionsTable.$inferInsert;
