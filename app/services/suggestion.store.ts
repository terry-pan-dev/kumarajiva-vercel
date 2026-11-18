// The storage layer of glossary suggestions: the only module that reads or writes the
// `suggestions` table (docs/plans/glossary-suggestions.md). Rows are never deleted: a
// suggestion that is no longer pending is the history of the entry it was about.
//
// Every write to a suggestion is conditional on it still being pending, in the same statement,
// so two people acting on one suggestion at once cannot both succeed: the second gets nothing
// back and is told it is no longer pending.
import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';

import { suggestionsTable, type CreateSuggestion, type ReadSuggestion } from '~/drizzle/tables';
import { getDb } from '~/lib/db.server';
import { type SuggestionAction, type SuggestionStatus, type SuggestionTarget } from '~/utils/constants';

const db = getDb();

const pending = eq(suggestionsTable.status, 'pending');

// The columns a write may set on a pending suggestion. The kind, target and submitter are set
// once, on insert, except where a finalizer converts a suggestion (merge, flag → edit).
export type SuggestionPatch = Partial<
  Omit<CreateSuggestion, 'id' | 'createdAt' | 'createdBy' | 'updatedAt' | 'deletedAt'>
> & { updatedBy: string };

export type SuggestionFilter = {
  status?: SuggestionStatus;
  targetKind?: SuggestionTarget;
  action?: SuggestionAction;
  createdBy?: string;
  ready?: boolean;
  reviewed?: boolean;
  limit: number;
  offset?: number;
};

export const SuggestionStore = {
  // --------------------------------------------------
  // READ
  // --------------------------------------------------

  findById: async (id: string): Promise<ReadSuggestion | undefined> => {
    const [row] = await db.select().from(suggestionsTable).where(eq(suggestionsTable.id, id)).limit(1);
    return row;
  },

  // The Suggestions tab: a filtered page, oldest first (the queue order), with the total.
  list: async (filter: SuggestionFilter): Promise<{ rows: ReadSuggestion[]; total: number }> => {
    const conditions: SQL[] = [];
    if (filter.status) conditions.push(eq(suggestionsTable.status, filter.status));
    if (filter.targetKind) conditions.push(eq(suggestionsTable.targetKind, filter.targetKind));
    if (filter.action) conditions.push(eq(suggestionsTable.action, filter.action));
    if (filter.createdBy) conditions.push(eq(suggestionsTable.createdBy, filter.createdBy));
    if (filter.ready !== undefined) {
      conditions.push(filter.ready ? isNotNull(suggestionsTable.readyAt) : isNull(suggestionsTable.readyAt));
    }
    if (filter.reviewed !== undefined) {
      conditions.push(filter.reviewed ? isNotNull(suggestionsTable.reviewedAt) : isNull(suggestionsTable.reviewedAt));
    }
    const where = conditions.length ? and(...conditions) : undefined;
    const [rows, [{ count }]] = await Promise.all([
      db
        .select()
        .from(suggestionsTable)
        .where(where)
        .orderBy(asc(suggestionsTable.createdAt), asc(suggestionsTable.id))
        .limit(filter.limit)
        .offset(filter.offset ?? 0),
      db
        .select({ count: sql<number>`count(*)` })
        .from(suggestionsTable)
        .where(where),
    ]);
    return { rows, total: Number(count) };
  },

  // The pending suggestions about these terms (new translations, edits, flags), for showing
  // them on the glossary cards, oldest first.
  findPendingByGlossaryIds: async (glossaryIds: string[]): Promise<ReadSuggestion[]> => {
    if (!glossaryIds.length) return [];
    return db
      .select()
      .from(suggestionsTable)
      .where(and(pending, inArray(suggestionsTable.glossaryId, glossaryIds)))
      .orderBy(asc(suggestionsTable.createdAt));
  },

  // Pending new terms whose proposed headword contains `query`, for search: they are not in
  // Algolia, and showing them keeps the same term from being suggested twice.
  findPendingNewTerms: async (query: string, limit: number): Promise<ReadSuggestion[]> => {
    const trimmed = query.trim();
    if (!trimmed) return [];
    return db
      .select()
      .from(suggestionsTable)
      .where(
        and(
          pending,
          eq(suggestionsTable.targetKind, 'glossary_term'),
          ilike(sql`${suggestionsTable.proposed}->>'sourceTerm'`, `%${trimmed}%`),
        ),
      )
      .orderBy(asc(suggestionsTable.createdAt))
      .limit(limit);
  },

  // Every suggestion about a term, newest first: its history.
  findByGlossaryId: async (glossaryId: string): Promise<ReadSuggestion[]> => {
    return db
      .select()
      .from(suggestionsTable)
      .where(eq(suggestionsTable.glossaryId, glossaryId))
      .orderBy(desc(suggestionsTable.createdAt));
  },

  // --------------------------------------------------
  // WRITE
  // --------------------------------------------------

  create: async (row: CreateSuggestion): Promise<ReadSuggestion> => {
    const [created] = await db.insert(suggestionsTable).values(row).returning();
    return created;
  },

  // Sets `patch` on the suggestion if it is still pending. Undefined if it is not (any more),
  // or does not exist. A patch that sets a final status is how a suggestion is finalized: it
  // is the claim that only one finalizer can win.
  updatePending: async (id: string, patch: SuggestionPatch): Promise<ReadSuggestion | undefined> => {
    const [row] = await db
      .update(suggestionsTable)
      .set(patch)
      .where(and(eq(suggestionsTable.id, id), pending))
      .returning();
    return row;
  },

  // Undoes a claim whose apply failed: back to pending, decision cleared. Only from `accepted`
  // and only with no applied_id, so it can never reopen a suggestion that did take effect.
  releaseClaim: async (id: string, updatedBy: string): Promise<void> => {
    await db
      .update(suggestionsTable)
      .set({ status: 'pending', decidedBy: null, decidedAt: null, decisionNote: null, updatedBy })
      .where(
        and(eq(suggestionsTable.id, id), eq(suggestionsTable.status, 'accepted'), isNull(suggestionsTable.appliedId)),
      );
  },

  // Records what an accepted suggestion created or changed.
  setApplied: async (id: string, appliedId: string): Promise<void> => {
    await db.update(suggestionsTable).set({ appliedId }).where(eq(suggestionsTable.id, id));
  },
};
