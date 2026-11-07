// The glossary's storage layer: the only module that knows how a term's translations are
// stored. Every read and write of translations goes through here; reads return GlossaryEntry
// (glossary.types.ts) and writes take the translations apart from the term's own columns, so
// the rest of the app never sees the storage shape.
//
// Translations are rows of `glossary_translations`, one per translation, in `position` order
// (docs/plans/glossary-refactor.md). The old `glossaries.translations` JSON column was
// dropped in migration 0026.
import { and, desc, eq, exists, getTableColumns, ilike, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';

import { glossariesTable, glossaryTranslationsTable, type CreateGlossary, type UpdateGlossary } from '~/drizzle/tables';
import { getDb } from '~/lib/db.server';

import { diffTranslations, type StoredTranslation, type TranslationBasis, type TranslationDiff } from './glossary.diff';
import { groupByGlossaryId, newTranslationRow, toGlossaryTranslation, translationContent } from './glossary.rows';
import {
  type GlossaryEntry,
  type GlossaryTerm,
  type GlossaryTranslation,
  type LegacyGlossaryColumn,
} from './glossary.types';

const db = getDb();

type Db = typeof db;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Client = Db | Tx;

const translationsTable = glossaryTranslationsTable;

// Every column of `glossaries` except the legacy one: the term's own fields. Its translations
// are loaded separately.
const termColumns = (() => {
  const { legacyTempTerm, ...columns } = getTableColumns(glossariesTable);
  void legacyTempTerm;
  return columns;
})();

// Soft-deleted rows (deleted_at set) are in the trash: every read below leaves them out unless
// its name says IncludingTrash or Trashed, so they are gone from the glossary page, search,
// downloads and editing. The Glossary Inspector lists them through findTrashed.
const notTrashed = isNull(glossariesTable.deletedAt);
const trashed = isNotNull(glossariesTable.deletedAt);

// The rows for `ids`, in the order of `ids`. Ids with no row are left out.
export const inIdOrder = <T extends { id: string }>(ids: readonly string[], rows: readonly T[]): T[] => {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.map((id) => byId.get(id)).filter((row): row is T => row !== undefined);
};

// The translations of the given terms, or of every term, grouped by term in position order.
const loadTranslations = async (client: Client, glossaryIds: readonly string[] | 'all') => {
  if (glossaryIds !== 'all' && glossaryIds.length === 0) return new Map<string, StoredTranslation[]>();
  const rows = await client
    .select()
    .from(translationsTable)
    .where(glossaryIds === 'all' ? undefined : inArray(translationsTable.glossaryId, [...glossaryIds]))
    .orderBy(translationsTable.glossaryId, translationsTable.position, translationsTable.id);
  return groupByGlossaryId(rows);
};

// The terms, in the order given, each with its translations. `all` loads every translation in
// one query instead of naming every term, for the reads that take the whole glossary.
const withTranslations = async <T extends { id: string }>(
  terms: T[],
  scope: 'these' | 'all' = 'these',
  client: Client = db,
): Promise<(T & { translations: GlossaryTranslation[] })[]> => {
  if (!terms.length) return [];
  const byTerm = await loadTranslations(client, scope === 'all' ? 'all' : terms.map((term) => term.id));
  return terms.map((term) => ({ ...term, translations: byTerm.get(term.id) ?? [] }));
};

const selectTerms = (client: Client = db) => client.select(termColumns).from(glossariesTable);

// The term's own columns, for writing. Translations are never among them: they are passed to
// create, update and revive as a list of their own.
export type GlossaryTermInput = Omit<CreateGlossary, LegacyGlossaryColumn>;
export type GlossaryTermUpdate = Omit<UpdateGlossary, 'id' | LegacyGlossaryColumn>;

export type GlossaryPage = {
  glossaries: GlossaryEntry[];
  totalCount: number;
};

export type IndexableGlossary = Pick<GlossaryEntry, 'id' | 'sourceTerm' | 'phonetic' | 'translations'>;

// Writes `diff` to term `glossaryId`'s rows. A translation whose content changed is stamped
// as edited by its updatedBy, now; one that only moved keeps who and when, since nobody edited it.
const applyDiff = async (tx: Tx, glossaryId: string, diff: TranslationDiff) => {
  const ofTerm = eq(translationsTable.glossaryId, glossaryId);
  if (diff.remove.length) {
    await tx.delete(translationsTable).where(and(ofTerm, inArray(translationsTable.id, diff.remove)));
  }
  for (const { id, position, translation, contentChanged } of diff.update) {
    await tx
      .update(translationsTable)
      .set(
        contentChanged
          ? { ...translationContent(translation), position, updatedBy: translation.updatedBy }
          : // An explicit updated_at overrides the column's $onUpdate (now).
            { position, updatedAt: sql`${translationsTable.updatedAt}` },
      )
      .where(and(ofTerm, eq(translationsTable.id, id)));
  }
  if (diff.insert.length) {
    await tx
      .insert(translationsTable)
      .values(diff.insert.map(({ position, translation }) => newTranslationRow(glossaryId, position, translation)));
  }
};

// Inserts `translations` as the term's rows, in order. The term must have none.
const insertAll = async (tx: Tx, glossaryId: string, translations: readonly GlossaryTranslation[]) => {
  if (!translations.length) return [];
  const rows = await tx
    .insert(translationsTable)
    .values(translations.map((translation, position) => newTranslationRow(glossaryId, position, translation)))
    .returning();
  return rows.sort((a, b) => a.position - b.position).map(toGlossaryTranslation);
};

export const GlossaryStore = {
  // --------------------------------------------------
  // READ
  // --------------------------------------------------

  findById: async (id: string): Promise<GlossaryEntry | undefined> => {
    const [term] = await withTranslations(
      await selectTerms()
        .where(and(eq(glossariesTable.id, id), notTrashed))
        .limit(1),
    );
    return term;
  },

  findByIds: async (ids: string[]): Promise<GlossaryEntry[]> => {
    if (!ids.length) return [];
    return withTranslations(
      await selectTerms()
        .where(and(inArray(glossariesTable.id, ids), notTrashed))
        .orderBy(desc(glossariesTable.sourceTerm)),
    );
  },

  // For search: the live entries for `ids` in the order given (the hits' ranking).
  findByIdsInOrder: async (ids: string[]): Promise<GlossaryEntry[]> => {
    if (!ids.length) return [];
    const terms = await selectTerms().where(and(inArray(glossariesTable.id, ids), notTrashed));
    return withTranslations(inIdOrder(ids, terms));
  },

  findByTerms: async (terms: string[]): Promise<GlossaryEntry[]> => {
    if (!terms.length) return [];
    return withTranslations(await selectTerms().where(and(inArray(glossariesTable.sourceTerm, terms), notTrashed)));
  },

  // The term stays unique across the trash — the unique index covers every row — so anything
  // about to create a term has to see trashed rows too, or it collides with one.
  findByTermsIncludingTrash: async (terms: string[]): Promise<GlossaryEntry[]> => {
    if (!terms.length) return [];
    return withTranslations(await selectTerms().where(inArray(glossariesTable.sourceTerm, terms)));
  },

  findByIdsIncludingTrash: async (ids: string[]): Promise<GlossaryEntry[]> => {
    if (!ids.length) return [];
    return withTranslations(await selectTerms().where(inArray(glossariesTable.id, ids)));
  },

  findAll: async (): Promise<GlossaryEntry[]> => {
    return withTranslations(await selectTerms().where(notTrashed).orderBy(desc(glossariesTable.sourceTerm)), 'all');
  },

  // The glossary page: most recently edited first.
  findPage: async ({ page, limit }: { page: number; limit: number }): Promise<GlossaryPage> => {
    const [terms, [{ count }]] = await Promise.all([
      selectTerms()
        .where(notTrashed)
        .orderBy(desc(glossariesTable.updatedAt), desc(glossariesTable.createdAt), desc(glossariesTable.sourceTerm))
        .limit(limit)
        .offset((page - 1) * limit),
      db
        .select({ count: sql<number>`count(*)` })
        .from(glossariesTable)
        .where(notTrashed),
    ]);
    return { glossaries: await withTranslations(terms), totalCount: Number(count) };
  },

  // The trash, most recently deleted first, capped at `limit`.
  findTrashed: async (limit: number): Promise<{ rows: GlossaryEntry[]; total: number }> => {
    const [terms, [{ count }]] = await Promise.all([
      selectTerms().where(trashed).orderBy(desc(glossariesTable.deletedAt), glossariesTable.sourceTerm).limit(limit),
      db
        .select({ count: sql<number>`count(*)` })
        .from(glossariesTable)
        .where(trashed),
    ]);
    return { rows: await withTranslations(terms), total: Number(count) };
  },

  // The trashed rows among `ids`.
  findTrashedByIds: async (ids: string[]): Promise<GlossaryEntry[]> => {
    if (!ids.length) return [];
    return withTranslations(await selectTerms().where(and(inArray(glossariesTable.id, ids), trashed)));
  },

  // Every row, trash included, for the Glossary Inspector.
  findAllIncludingTrash: async (): Promise<GlossaryEntry[]> => {
    return withTranslations(await selectTerms().orderBy(glossariesTable.sourceTerm), 'all');
  },

  // The inspector's search box: an exact uuid, or a term, search_id or translation containing
  // the query. A translation matches on its rendering, source, passages, author or rationale.
  // Trash included, since the inspector shows every row.
  findForInspection: async (query: string, limit: number): Promise<GlossaryEntry[]> => {
    const trimmed = query.trim();
    if (!trimmed) return [];

    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
      return withTranslations(await selectTerms().where(sql`${glossariesTable.id} = ${trimmed}::uuid`));
    }

    const pattern = `%${trimmed}%`;
    const translationMatches = db
      .select({ one: sql`1` })
      .from(translationsTable)
      .where(
        and(
          eq(translationsTable.glossaryId, glossariesTable.id),
          or(
            ilike(translationsTable.term, pattern),
            ilike(translationsTable.sourceName, pattern),
            ilike(translationsTable.sourceText, pattern),
            ilike(translationsTable.targetText, pattern),
            ilike(translationsTable.author, pattern),
            ilike(translationsTable.rationale, pattern),
          ),
        ),
      );
    return withTranslations(
      await selectTerms()
        .where(
          or(
            ilike(glossariesTable.sourceTerm, pattern),
            eq(glossariesTable.searchId, trimmed),
            exists(translationMatches),
          ),
        )
        .orderBy(glossariesTable.sourceTerm)
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
    const terms = await db
      .select({
        id: glossariesTable.id,
        sourceTerm: glossariesTable.sourceTerm,
        phonetic: glossariesTable.phonetic,
      })
      .from(glossariesTable)
      .where(and(notTrashed, afterId ? sql`${glossariesTable.id} > ${afterId}::uuid` : undefined))
      .orderBy(glossariesTable.id)
      .limit(limit);
    return withTranslations(terms);
  },

  // --------------------------------------------------
  // CREATE
  // --------------------------------------------------

  // A new term with its translations, in order, in one transaction.
  create: async (term: GlossaryTermInput, translations: GlossaryTranslation[]): Promise<GlossaryEntry> => {
    return db.transaction(async (tx) => {
      const [row] = await tx.insert(glossariesTable).values(term).returning(termColumns);
      return { ...row, translations: await insertAll(tx, row.id, translations) };
    });
  },

  // --------------------------------------------------
  // UPDATE
  // --------------------------------------------------

  // Sets the term's columns and makes its translations `translations`, in that order, in one
  // transaction. The list is the whole of them as far as its maker knew: a translation carrying
  // a stored id is that translation, edited; one without an id is new; a stored translation the
  // list leaves out is removed if it is in `basis` (the ids the list was built from), and kept,
  // after the listed ones, if it was added since. No basis: every stored one counts as known.
  // Only the difference is written (diffTranslations in glossary.diff.ts), so
  // translations nobody changed keep their ids and audit.
  // Throws TranslationListError, writing nothing, if the list names an id the term does not
  // have (any more) or names one twice. Undefined if no row has `id`.
  update: async (
    id: string,
    term: GlossaryTermUpdate,
    translations: GlossaryTranslation[],
    basis?: TranslationBasis,
  ): Promise<GlossaryEntry | undefined> => {
    return db.transaction(async (tx) => {
      // Updating the term first also locks its row, so two saves of one term run one after
      // the other and each diffs against what the other left. updated_at is always set: it
      // keeps a translation-only save (the insert form passes no term columns) from being an
      // empty SET, which Drizzle refuses, and it moves the term up the glossary page, which
      // lists the most recently edited first.
      const [row] = await tx
        .update(glossariesTable)
        .set({ ...term, updatedAt: term.updatedAt ?? new Date() })
        .where(eq(glossariesTable.id, id))
        .returning(termColumns);
      if (!row) return undefined;
      const stored = (await loadTranslations(tx, [id])).get(id) ?? [];
      await applyDiff(tx, id, diffTranslations(stored, translations, basis));
      return { ...row, translations: (await loadTranslations(tx, [id])).get(id) ?? [] };
    });
  },

  // Takes a trashed term out of the trash with new contents, keeping its uuid: nothing of the
  // trashed translations survives. Not indexed (search_id cleared) until the caller indexes it.
  // Undefined if the row is not in the trash (any more).
  revive: async (
    id: string,
    term: GlossaryTermUpdate,
    translations: GlossaryTranslation[],
  ): Promise<GlossaryEntry | undefined> => {
    // The create form's term carries the uuid it would have had as a new row. Written here it
    // would move the row to that uuid, which its translations' foreign key refuses.
    const { id: _newId, ...columns } = term as GlossaryTermUpdate & { id?: string };
    void _newId;
    return db.transaction(async (tx) => {
      const [row] = await tx
        .update(glossariesTable)
        .set({ ...columns, deletedAt: null, searchId: null })
        .where(and(eq(glossariesTable.id, id), trashed))
        .returning(termColumns);
      if (!row) return undefined;
      await tx.delete(translationsTable).where(eq(translationsTable.glossaryId, id));
      return { ...row, translations: await insertAll(tx, id, translations) };
    });
  },

  // The term's own columns only (search_id, the trash, …); its translations are left as they are.
  updateTerm: async (id: string, data: GlossaryTermUpdate): Promise<GlossaryTerm | undefined> => {
    const [row] = await db.update(glossariesTable).set(data).where(eq(glossariesTable.id, id)).returning(termColumns);
    return row;
  },
};
