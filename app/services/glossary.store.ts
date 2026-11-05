// The glossary's storage layer: the only module that knows how a term's translations are
// stored. Every read and write of translations goes through here; reads return GlossaryEntry
// (glossary.types.ts) and writes take the translations apart from the term's own columns, so
// the rest of the app never sees the storage shape.
//
// Translations are still the `glossaries.translations` JSON column. When they move to the
// `glossary_translations` table (docs/plans/glossary-refactor.md, PR 4), this module changes
// and its callers do not.
import { and, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';

import { glossariesTable, type CreateGlossary, type ReadGlossary, type UpdateGlossary } from '~/drizzle/tables';
import { getDb } from '~/lib/db.server';

import { type GlossaryEntry, type GlossaryTerm, type GlossaryTranslation } from './glossary.types';

const db = getDb();

// Soft-deleted rows (deleted_at set) are in the trash: every read below leaves them out unless
// its name says IncludingTrash or Trashed, so they are gone from the glossary page, search,
// downloads and editing. The Glossary Inspector lists them through findTrashed.
const notTrashed = isNull(glossariesTable.deletedAt);
const trashed = isNotNull(glossariesTable.deletedAt);

// A stored row as an entry. The JSON column can be null; an entry always has an array.
export const toGlossaryEntry = (row: ReadGlossary): GlossaryEntry => ({
  ...row,
  translations: row.translations ?? [],
});

// The rows for `ids`, in the order of `ids`. Ids with no row are left out.
export const inIdOrder = <T extends { id: string }>(ids: readonly string[], rows: readonly T[]): T[] => {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.map((id) => byId.get(id)).filter((row): row is T => row !== undefined);
};

const entries = (rows: ReadGlossary[]) => rows.map(toGlossaryEntry);

// A stored row without its translations.
const toGlossaryTerm = (row: ReadGlossary): GlossaryTerm => {
  const { translations, ...term } = row;
  void translations;
  return term;
};

// The term's own columns, for writing. Translations are never among them: they are passed to
// create, update and revive as a list of their own.
export type GlossaryTermInput = Omit<CreateGlossary, 'translations'>;
export type GlossaryTermUpdate = Omit<UpdateGlossary, 'id' | 'translations'>;

export type GlossaryPage = {
  glossaries: GlossaryEntry[];
  totalCount: number;
};

export type IndexableGlossary = Pick<GlossaryEntry, 'id' | 'glossary' | 'phonetic' | 'translations'>;

export const GlossaryStore = {
  // --------------------------------------------------
  // READ
  // --------------------------------------------------

  findById: async (id: string): Promise<GlossaryEntry | undefined> => {
    const row = await db.query.glossariesTable.findFirst({
      where: and(eq(glossariesTable.id, id), notTrashed),
    });
    return row && toGlossaryEntry(row);
  },

  findByIds: async (ids: string[]): Promise<GlossaryEntry[]> => {
    if (!ids.length) return [];
    return entries(
      await db.query.glossariesTable.findMany({
        where: and(inArray(glossariesTable.id, ids), notTrashed),
        orderBy: (t, { desc }) => [desc(t.glossary)],
      }),
    );
  },

  // For search: the live entries for `ids` in the order given (the hits' ranking).
  findByIdsInOrder: async (ids: string[]): Promise<GlossaryEntry[]> => {
    if (!ids.length) return [];
    const rows = await db
      .select()
      .from(glossariesTable)
      .where(and(inArray(glossariesTable.id, ids), notTrashed));
    return inIdOrder(ids, entries(rows));
  },

  findByTerms: async (terms: string[]): Promise<GlossaryEntry[]> => {
    if (!terms.length) return [];
    return entries(
      await db.query.glossariesTable.findMany({
        where: and(inArray(glossariesTable.glossary, terms), notTrashed),
      }),
    );
  },

  // The term stays unique across the trash — the unique index covers every row — so anything
  // about to create a term has to see trashed rows too, or it collides with one.
  findByTermsIncludingTrash: async (terms: string[]): Promise<GlossaryEntry[]> => {
    if (!terms.length) return [];
    return entries(await db.query.glossariesTable.findMany({ where: inArray(glossariesTable.glossary, terms) }));
  },

  findByIdsIncludingTrash: async (ids: string[]): Promise<GlossaryEntry[]> => {
    if (!ids.length) return [];
    return entries(await db.query.glossariesTable.findMany({ where: inArray(glossariesTable.id, ids) }));
  },

  findAll: async (): Promise<GlossaryEntry[]> => {
    return entries(
      await db.query.glossariesTable.findMany({
        where: notTrashed,
        orderBy: (t, { desc }) => [desc(t.glossary)],
      }),
    );
  },

  // The glossary page: most recently edited first.
  findPage: async ({ page, limit }: { page: number; limit: number }): Promise<GlossaryPage> => {
    const [rows, [{ count }]] = await Promise.all([
      db.query.glossariesTable.findMany({
        where: notTrashed,
        limit,
        offset: (page - 1) * limit,
        orderBy: (t, { desc }) => [desc(t.updatedAt), desc(t.createdAt), desc(t.glossary)],
      }),
      db
        .select({ count: sql<number>`count(*)` })
        .from(glossariesTable)
        .where(notTrashed),
    ]);
    return { glossaries: entries(rows), totalCount: Number(count) };
  },

  // The trash, most recently deleted first, capped at `limit`.
  findTrashed: async (limit: number): Promise<{ rows: GlossaryEntry[]; total: number }> => {
    const [rows, [{ count }]] = await Promise.all([
      db
        .select()
        .from(glossariesTable)
        .where(trashed)
        .orderBy(desc(glossariesTable.deletedAt), glossariesTable.glossary)
        .limit(limit),
      db
        .select({ count: sql<number>`count(*)` })
        .from(glossariesTable)
        .where(trashed),
    ]);
    return { rows: entries(rows), total: Number(count) };
  },

  // The trashed rows among `ids`.
  findTrashedByIds: async (ids: string[]): Promise<GlossaryEntry[]> => {
    if (!ids.length) return [];
    return entries(
      await db
        .select()
        .from(glossariesTable)
        .where(and(inArray(glossariesTable.id, ids), trashed)),
    );
  },

  // Every row, trash included, for the Glossary Inspector.
  findAllIncludingTrash: async (): Promise<GlossaryEntry[]> => {
    return entries(await db.select().from(glossariesTable).orderBy(glossariesTable.glossary));
  },

  // The inspector's search box: an exact uuid, or a term, search_id or translation containing
  // the query. Trash included, since the inspector shows every row.
  findForInspection: async (query: string, limit: number): Promise<GlossaryEntry[]> => {
    const trimmed = query.trim();
    if (!trimmed) return [];

    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
      return entries(
        await db
          .select()
          .from(glossariesTable)
          .where(sql`${glossariesTable.id} = ${trimmed}::uuid`),
      );
    }

    const pattern = `%${trimmed}%`;
    return entries(
      await db
        .select()
        .from(glossariesTable)
        .where(
          sql`${glossariesTable.glossary} ILIKE ${pattern} OR ${glossariesTable.searchId} = ${trimmed} OR ${glossariesTable.translations}::text ILIKE ${pattern}`,
        )
        .orderBy(glossariesTable.glossary)
        .limit(limit),
    );
  },

  // One page of live entries for re-indexing, in id order after `afterId` (keyset paging).
  findIndexPage: async ({
    afterId,
    limit,
  }: {
    afterId: string | null;
    limit: number;
  }): Promise<IndexableGlossary[]> => {
    const rows = await db
      .select({
        id: glossariesTable.id,
        glossary: glossariesTable.glossary,
        phonetic: glossariesTable.phonetic,
        translations: glossariesTable.translations,
      })
      .from(glossariesTable)
      .where(and(notTrashed, afterId ? sql`${glossariesTable.id} > ${afterId}::uuid` : undefined))
      .orderBy(glossariesTable.id)
      .limit(limit);
    return rows.map((row) => ({ ...row, translations: row.translations ?? [] }));
  },

  // --------------------------------------------------
  // CREATE
  // --------------------------------------------------

  // A new term with its translations, in order.
  create: async (term: GlossaryTermInput, translations: GlossaryTranslation[]): Promise<GlossaryEntry> => {
    const [row] = await db
      .insert(glossariesTable)
      .values({ ...term, translations })
      .returning();
    return toGlossaryEntry(row);
  },

  // --------------------------------------------------
  // UPDATE
  // --------------------------------------------------

  // Sets the term's columns and makes its translations exactly `translations`, in that order.
  // The list is the whole of them: a translation carrying a stored id is that translation,
  // edited; one without an id is new; a stored translation the list leaves out is removed.
  // While translations are JSON this simply rewrites the column; once they are rows
  // (docs/plans/glossary-refactor.md, PR 4) it writes the difference (diffTranslations in
  // glossary.diff.ts). Undefined if no row has `id`.
  update: async (
    id: string,
    term: GlossaryTermUpdate,
    translations: GlossaryTranslation[],
  ): Promise<GlossaryEntry | undefined> => {
    const [row] = await db
      .update(glossariesTable)
      .set({ ...term, translations })
      .where(eq(glossariesTable.id, id))
      .returning();
    return row && toGlossaryEntry(row);
  },

  // Takes a trashed term out of the trash with new contents, keeping its uuid: nothing of the
  // trashed translations survives. Not indexed (search_id cleared) until the caller indexes it.
  // Undefined if the row is not in the trash (any more).
  revive: async (
    id: string,
    term: GlossaryTermUpdate,
    translations: GlossaryTranslation[],
  ): Promise<GlossaryEntry | undefined> => {
    const [row] = await db
      .update(glossariesTable)
      .set({ ...term, translations, deletedAt: null, searchId: null })
      .where(and(eq(glossariesTable.id, id), trashed))
      .returning();
    return row && toGlossaryEntry(row);
  },

  // The term's own columns only (search_id, the trash, …); its translations are left as they are.
  updateTerm: async (id: string, data: GlossaryTermUpdate): Promise<GlossaryTerm | undefined> => {
    const [row] = await db.update(glossariesTable).set(data).where(eq(glossariesTable.id, id)).returning();
    return row && toGlossaryTerm(row);
  },
};
