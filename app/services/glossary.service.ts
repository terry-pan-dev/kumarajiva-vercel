import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import OpenAI from 'openai';
import 'dotenv/config';

import { glossariesTable, type CreateGlossary, type ReadGlossary, type UpdateGlossary } from '~/drizzle/tables';
import { getDb } from '~/lib/db.server';
import algoliaClient from '~/providers/algolia';

import { DbGlossaries, notTrashed } from './glossary.crud';
import { mergeTranslations } from './glossary.merge';
import { groupRows, type GlossaryImportRow } from './glossary.parse';
import { glossaryIndexRecord, searchablePhonetic } from './glossary.record';

// Re-exported so callers of importGlossaries can reach the row type from one place.
// The parsers themselves live in glossary.parse.ts because they run in the browser.
export type { GlossaryImportRow } from './glossary.parse';

const dbClient = getDb();

// Max parallel DB + Algolia calls per import batch.
export const IMPORT_CONCURRENCY = 10;

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export type Pagination = {
  page: number;
  limit?: number;
};

export const readGlossaries = async ({
  page,
  limit = 10,
}: Pagination): Promise<{
  glossaries: Omit<ReadGlossary, 'similarity'>[];
  totalPages: number;
}> => {
  const [glossaries, totalCount] = await Promise.all([
    dbClient.query.glossariesTable.findMany({
      where: notTrashed,
      limit,
      offset: (page - 1) * limit,
      orderBy: (glossaries, { desc }) => [
        desc(glossaries.updatedAt),
        desc(glossaries.createdAt),
        desc(glossaries.glossary),
      ],
    }),
    dbClient
      .select({ count: sql<number>`count(*)` })
      .from(glossariesTable)
      .where(notTrashed)
      .then((result) => result[0].count),
  ]);

  return {
    glossaries,
    totalPages: Math.ceil(totalCount / limit),
  };
};

export const getGlossariesByGivenGlossaries = async (glossaries: string[]): Promise<ReadGlossary[]> => {
  return DbGlossaries.findByTerms(glossaries);
};

export const readSutraNames = async () => {
  const result = await dbClient
    .select({ translations: glossariesTable.translations })
    .from(glossariesTable)
    .where(notTrashed);

  const sutraNames = result.map((r) => r.translations?.filter((t) => t.sutraName).map((t) => t.sutraName));
  return Array.from(new Set(sutraNames.flat()));
};

export const readGlossariesByIds = async (ids: string[]) => {
  return DbGlossaries.findByIds(ids);
};

type ReturnType<T> = T extends string ? number[] : T extends string[] ? number[][] : never;
export const generateEmbedding = async <T extends string | string[]>(text: T): Promise<ReturnType<T>> => {
  if (typeof text === 'string') {
    const embedding = await client.embeddings.create({
      input: text,
      model: 'text-embedding-3-small',
      encoding_format: 'float',
      dimensions: 1536,
    });

    return embedding.data[0].embedding as ReturnType<T>;
  }
  const embeddings = await client.embeddings.create({
    input: text,
    model: 'text-embedding-3-small',
    encoding_format: 'float',
    dimensions: 1536,
  });
  return embeddings.data.map((embedding) => embedding.embedding) as ReturnType<T>;
};

export const updateGlossarySubscribers = async (glossary: UpdateGlossary) => {
  if (!glossary.id) {
    throw new Error('Glossary id is required');
  }
  if (glossary.subscribers) {
    const newSubscribers =
      glossary.subscribers > 0 ? sql`${glossariesTable.subscribers} + 1` : sql`${glossariesTable.subscribers} - 1`;
    return dbClient
      .update(glossariesTable)
      .set({ subscribers: newSubscribers })
      .where(eq(glossariesTable.id, glossary.id));
  }
  return dbClient.update(glossariesTable).set(glossary).where(eq(glossariesTable.id, glossary.id));
};

export const updateGlossaryTranslations = async ({
  id,
  phonetic,
  author,
  cbetaFrequency,
  translations = [],
  discussion,
  updatedBy,
  isNewInsert = false,
}: {
  id: string;
  phonetic: string | null;
  author: string | null;
  cbetaFrequency: string | null;
  discussion: string | null;
  translations: UpdateGlossary['translations'];
  updatedBy: string | null;
  isNewInsert?: boolean;
}) => {
  const glossary = await DbGlossaries.findById(id);
  if (!glossary) {
    throw new Error('Glossary not found');
  }
  const { searchId } = glossary;

  let newTranslations = [...(translations ?? [])];
  if (isNewInsert) {
    newTranslations = [...(glossary.translations ?? []), ...(translations ?? [])];
  }
  const translationsToSearch = newTranslations?.map((translation) => ({
    glossary: translation.glossary,
    language: translation.language,
    phonetic: translation.phonetic ?? undefined,
  }));

  if (searchId) {
    await algoliaClient.partialUpdateObject({
      indexName: 'glossaries',
      objectID: searchId,
      attributesToUpdate: {
        // undefined rather than null: this is a partial update, where undefined leaves the
        // stored phonetic alone and null would erase it. Clearing a phonetic is left to a
        // re-index, which rewrites the whole record.
        translations: translationsToSearch,
        phonetic: searchablePhonetic(phonetic) ?? undefined,
      },
    });
  }

  const toUpdate = {
    translations: newTranslations,
    phonetic: phonetic ?? undefined,
    author: author ?? undefined,
    cbetaFrequency: cbetaFrequency ?? undefined,
    updatedBy: updatedBy ?? undefined,
    discussion: discussion ?? undefined,
  };

  return DbGlossaries.updateById(id, toUpdate);
};

export const createGlossary = async (glossary: Omit<CreateGlossary, 'searchId'>) => {
  return DbGlossaries.create(glossary);
};

// Creates the entry, then indexes it. Indexing first meant a failed insert left a record no row
// claimed — an orphan, which a later import turns into a duplicate as soon as that uuid is
// reused. Writing the row first makes the worst case an entry missing from search, which the
// inspector reports as not-indexed and any re-index repairs.
export const createGlossaryAndIndexInAlgolia = async (glossary: Omit<CreateGlossary, 'searchId'>) => {
  const [row] = await DbGlossaries.create(glossary);

  try {
    await algoliaClient.saveObject({ indexName: 'glossaries', body: glossaryIndexRecord(row) });
  } catch (error) {
    // The entry is saved and correct — it just cannot be found by search yet. Reported rather
    // than thrown so one indexing failure doesn't abort a whole import.
    console.error('Failed to index new glossary entry', row.id, error);
    return [row];
  }

  return DbGlossaries.updateById(row.id, { searchId: row.id });
};

export const searchGlossaries = async (tokens: string[]) => {
  const glossaryIds: string[] = [];
  const batchSize = 50;
  const batches = [];
  for (let i = 0; i < tokens.length; i += batchSize) {
    batches.push(tokens.slice(i, i + batchSize));
  }
  const multiSearchQueryBatches = batches.map((batch) => {
    return batch?.map((token) => ({
      indexName: 'glossaries',
      query: token,
      hitsPerPage: 1,
      removeStopWords: true,
    }));
  });
  const indexExist = await algoliaClient.indexExists({ indexName: 'glossaries' });
  if (!indexExist) {
    return [];
  }
  for await (const batch of multiSearchQueryBatches) {
    const { results } = await algoliaClient.search<ReadGlossary>({
      requests: batch,
    });
    if (results.length) {
      results.forEach((result) => {
        if ('hits' in result) {
          result.hits.forEach((hit) => {
            if (hit.id) {
              glossaryIds.push(hit.id);
            }
          });
        }
      });
    }
    console.log('glossary_searcher result', results?.length);
  }

  // Get full details from database using the IDs
  if (glossaryIds.length === 0) {
    return [];
  }

  const glossaries = await readGlossariesByIds(glossaryIds);
  return glossaries.reduce(
    (acc, glossary) => {
      if (glossary.glossary) {
        acc[glossary.glossary] = {
          definitions: glossary.translations?.map((t) => t.glossary) ?? [],
          sutraTexts:
            glossary.translations?.map((t) => ({
              chinese: t.originSutraText,
              english: t.targetSutraText,
              sutraName: t.sutraName,
              volume: t.volume,
            })) ?? [],
        };
      }
      return acc;
    },
    {} as Record<
      string,
      {
        definitions: string[];
        sutraTexts: Array<{ chinese?: string | null; english?: string | null; sutraName: string; volume: string }>;
      }
    >,
  );
};

export const getAllGlossaries = async (): Promise<ReadGlossary[]> => {
  return DbGlossaries.findAll();
};

export type ImportGlossaryResult = {
  created: number;
  updated: number;
  failed: number;
};

export const importGlossaries = async (rows: GlossaryImportRow[], userId: string): Promise<ImportGlossaryResult> => {
  // Same grouping the preview uses, so what gets written matches what was reviewed.
  const groups = groupRows(rows);

  const uuids = groups.map((g) => g.uuid).filter(Boolean);
  const terms = groups.map((g) => g.key);

  // Trashed rows are matched too: the term is still taken by them, so creating it again would
  // collide with the unique index. A match in the trash is revived with the file's contents.
  const [existingByUuid, existingByTerm] = await Promise.all([
    uuids.length > 0 ? DbGlossaries.findByIdsIncludingTrash(uuids) : Promise.resolve([]),
    terms.length > 0 ? DbGlossaries.findByTermsIncludingTrash(terms) : Promise.resolve([]),
  ]);

  const idMap = new Map(existingByUuid.map((g) => [g.id, g]));
  const termMap = new Map(existingByTerm.map((g) => [g.glossary, g]));

  let created = 0;
  let updated = 0;
  let failed = 0;
  const now = new Date().toISOString();

  for (let i = 0; i < groups.length; i += IMPORT_CONCURRENCY) {
    const batch = groups.slice(i, i + IMPORT_CONCURRENCY);

    const results = await Promise.allSettled(
      batch.map(async (group) => {
        const first = group.rows[0];
        // Typed as the stored shape so it merges with existing.translations without widening.
        const translations: NonNullable<UpdateGlossary['translations']> = group.rows
          .filter((r) => r.englishTerm)
          .map((r) => ({
            glossary: r.englishTerm,
            language: 'english' as const,
            sutraName: r.sutraName,
            volume: r.volume,
            updatedBy: userId,
            updatedAt: now,
            originSutraText: r.chineseSutraText || null,
            targetSutraText: r.englishSutraText || null,
            author: r.author || null,
          }));

        // Match on the supplied id first, then fall back to the term, which is what the
        // unique index actually constrains.
        const existing = (group.uuid ? idMap.get(group.uuid) : undefined) ?? termMap.get(group.key);

        if (existing?.deletedAt) {
          // Imported as if new, the way it would have been before deletes went to the trash:
          // the file's contents replace the trashed ones rather than merging with them.
          await reviveTrashedGlossary(existing.id, {
            glossary: group.key,
            phonetic: first.phonetic || null,
            cbetaFrequency: first.cbetaFrequency || null,
            author: first.author || null,
            discussion: null,
            translations,
            updatedBy: userId,
          });
          return 'created' as const;
        } else if (existing) {
          await updateGlossaryTranslations({
            id: existing.id,
            phonetic: first.phonetic || null,
            author: first.author || null,
            cbetaFrequency: first.cbetaFrequency || null,
            discussion: existing.discussion ?? null,
            // Translations are one JSON column: send the merge, not just the file's rows,
            // or every translation the file omits would be dropped.
            translations: mergeTranslations(existing.translations, translations),
            updatedBy: userId,
          });
          return 'updated' as const;
        } else {
          await createGlossaryAndIndexInAlgolia({
            ...(group.uuid ? { id: group.uuid } : {}),
            glossary: group.key,
            phonetic: first.phonetic || null,
            cbetaFrequency: first.cbetaFrequency || null,
            author: first.author || null,
            translations,
            createdBy: userId,
            updatedBy: userId,
          });
          return 'created' as const;
        }
      }),
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        if (result.value === 'updated') updated++;
        else created++;
      } else {
        console.error('Glossary import failed:', result.reason);
        failed++;
      }
    }
  }

  return { created, updated, failed };
};

export const deleteGlossariesByUserId = async (userId: string) => {
  const glossaries = await dbClient.query.glossariesTable.findMany({
    where: eq(glossariesTable.createdBy, userId),
  });

  const glossaryIds = glossaries.map((glossary) => glossary.id);
  await algoliaClient.deleteObjects({
    indexName: 'glossaries',
    objectIDs: glossaryIds,
  });
  return await dbClient.delete(glossariesTable).where(eq(glossariesTable.createdBy, userId));
};

// Every index record that belongs to each of the given entries, keyed by row id.
//
// A row names only the record it was last indexed into (search_id), but earlier imports can
// leave further records carrying the same uuid — the duplicates that make one entry show up
// several times in search. Deleting only search_id would leave those behind as orphans, which
// a later import can turn back into duplicates once the uuid is reused.
//
// `id` is not a facet on this index, so a filter query is not available; the siblings are
// found by searching each entry's own term and keeping the hits that carry its uuid. One
// multi-query covers the whole batch.
const findIndexObjectIdsForEntries = async (glossaries: ReadGlossary[]): Promise<Map<string, string[]>> => {
  const objectIds = new Map<string, Set<string>>();
  for (const glossary of glossaries) {
    objectIds.set(glossary.id, new Set([glossary.id, ...(glossary.searchId ? [glossary.searchId] : [])]));
  }
  if (glossaries.length === 0) return new Map();

  try {
    const { results } = await algoliaClient.search<{ id?: string }>({
      requests: glossaries.map((glossary) => ({
        indexName: 'glossaries',
        query: glossary.glossary,
        hitsPerPage: 200,
        attributesToRetrieve: ['id'],
      })),
    });
    results.forEach((result, position) => {
      if (!('hits' in result)) return;
      const glossary = glossaries[position];
      for (const hit of result.hits) {
        if (hit.id === glossary.id) objectIds.get(glossary.id)?.add(hit.objectID);
      }
    });
  } catch (error) {
    // Never block the delete on this lookup: the row's own objectIDs still go, and the
    // Glossary Inspector reports any record left behind.
    console.error('Could not look up sibling index records for glossaries', error);
  }

  return new Map([...objectIds].map(([id, set]) => [id, [...set]]));
};

// Moves one glossary entry to the trash: deleted_at is set and every Algolia record carrying
// its uuid is removed, so it disappears from the glossary page, search and editing. The row
// and all its translations are kept, so an admin can restore it — or delete it for good — from
// the Glossary Inspector. Returns the term and how many search records went, or null if the id
// matched no live entry.
export const trashGlossaryById = async (
  id: string,
  userId: string,
): Promise<{ term: string; deletedRecords: number } | null> => {
  const glossary = await DbGlossaries.findById(id);
  if (!glossary) return null;

  const objectIDs = (await findIndexObjectIdsForEntries([glossary])).get(glossary.id) ?? [];

  // Search first: a failure here leaves the entry live to retry, rather than a search hit
  // pointing at a row the reads now skip. deleteObjects ignores objectIDs that are not there.
  await algoliaClient.deleteObjects({ indexName: 'glossaries', objectIDs });
  // search_id is cleared because nothing is indexed any more; a restore writes it again.
  await DbGlossaries.updateById(id, { deletedAt: new Date(), searchId: null, updatedBy: userId });
  return { term: glossary.glossary, deletedRecords: objectIDs.length };
};

export const TRASH_LIST_LIMIT = 500;

// The trash, most recently deleted first, capped so a large one cannot swamp the inspector.
export const readTrashedGlossaries = async (
  limit = TRASH_LIST_LIMIT,
): Promise<{ rows: ReadGlossary[]; total: number }> => {
  const [rows, [{ count }]] = await Promise.all([
    dbClient
      .select()
      .from(glossariesTable)
      .where(isNotNull(glossariesTable.deletedAt))
      .orderBy(desc(glossariesTable.deletedAt), glossariesTable.glossary)
      .limit(limit),
    dbClient
      .select({ count: sql<number>`count(*)` })
      .from(glossariesTable)
      .where(isNotNull(glossariesTable.deletedAt)),
  ]);
  return { rows, total: Number(count) };
};

// The trashed rows among `ids`. Every trash operation goes through this, so an id that is live
// — or was restored by another admin since the page loaded — is skipped rather than acted on.
const findTrashed = async (ids: string[]): Promise<ReadGlossary[]> => {
  const unique = [...new Set(ids)].filter(Boolean);
  if (unique.length === 0) return [];
  return dbClient
    .select()
    .from(glossariesTable)
    .where(and(inArray(glossariesTable.id, unique), isNotNull(glossariesTable.deletedAt)));
};

export type TrashResult = { done: number; skipped: number };

// Takes entries back out of the trash: deleted_at is cleared and each is indexed again at its
// own uuid, so it is back in search exactly as it was.
export const restoreTrashedGlossaries = async (ids: string[]): Promise<TrashResult> => {
  const rows = await findTrashed(ids);
  if (rows.length > 0) {
    // Index first, so a failure leaves the entry in the trash rather than live but unsearchable.
    await algoliaClient.saveObjects({ indexName: 'glossaries', objects: rows.map(glossaryIndexRecord) });
    await dbClient
      .update(glossariesTable)
      .set({ deletedAt: null, searchId: sql`${glossariesTable.id}::text` })
      .where(
        and(
          inArray(
            glossariesTable.id,
            rows.map((row) => row.id),
          ),
          isNotNull(glossariesTable.deletedAt),
        ),
      );
  }
  return { done: rows.length, skipped: new Set(ids).size - rows.length };
};

// Permanently deletes trashed entries — the row and every translation in it — together with
// any search record still carrying their uuid (entries trashed before deletes cleared their
// records can still have some). Only rows already in the trash qualify.
// Irreversible — callers must gate this on the appropriate ability.
export const purgeTrashedGlossaries = async (ids: string[]): Promise<TrashResult> => {
  const rows = await findTrashed(ids);
  if (rows.length > 0) {
    const objectIDs = [...(await findIndexObjectIdsForEntries(rows)).values()].flat();
    await algoliaClient.deleteObjects({ indexName: 'glossaries', objectIDs });
    await dbClient.delete(glossariesTable).where(
      and(
        inArray(
          glossariesTable.id,
          rows.map((row) => row.id),
        ),
        isNotNull(glossariesTable.deletedAt),
      ),
    );
  }
  return { done: rows.length, skipped: new Set(ids).size - rows.length };
};

// Brings a trashed row back as a new entry with the given contents, keeping its uuid. For
// creating or importing a term the trash still holds — the unique index covers trashed rows,
// so inserting it again would fail. Nothing of the trashed contents survives.
export const reviveTrashedGlossary = async (
  id: string,
  data: Pick<
    CreateGlossary,
    'glossary' | 'phonetic' | 'author' | 'cbetaFrequency' | 'discussion' | 'translations' | 'updatedBy'
  > &
    Partial<Pick<CreateGlossary, 'subscribers'>>,
): Promise<ReadGlossary[]> => {
  const [row] = await dbClient
    .update(glossariesTable)
    .set({ ...data, deletedAt: null, searchId: null })
    .where(and(eq(glossariesTable.id, id), isNotNull(glossariesTable.deletedAt)))
    .returning();
  if (!row) throw new Error('Glossary is no longer in the trash');

  try {
    await algoliaClient.saveObject({ indexName: 'glossaries', body: glossaryIndexRecord(row) });
  } catch (error) {
    // Same trade as createGlossaryAndIndexInAlgolia: live but unsearchable, which re-indexing repairs.
    console.error('Failed to index revived glossary entry', row.id, error);
    return [row];
  }
  return DbGlossaries.updateById(row.id, { searchId: row.id });
};

// ─── Re-indexing ─────────────────────────────────────────────────────────────
//
// Rebuilds the search index from the glossary table, which is the source of truth: every field
// in a record is a projection of a row, so the index can always be regenerated and never holds
// anything that would be lost. This is the repair for an index that has drifted from the
// table — records missing, stale, or written under objectIDs the rows were never told about —
// and it is what to run after a change to the shape in glossaryIndexRecord.
//
// It writes rather than clearing first, so search is never empty: each row's record is
// overwritten in place at its uuid, and an entry that was already correct simply gets the same
// record again. Records left at old generated objectIDs are not touched here — after this runs
// they carry no row's uuid, so the Glossary Inspector reports them as orphans and its existing
// cleanup removes them. Splitting it that way keeps each step's runtime bounded and leaves the
// delete behind a separate, deliberate action.
//
// Paged rather than read whole: the translations column makes the full table far larger than
// the records built from it, and a page that has been indexed stays indexed if a later one
// fails, so a timeout leaves the glossary partly rebuilt rather than untouched.
//
// One page per call, with the caller holding the cursor, so the whole rebuild is a sequence of
// short requests instead of one long one. That is what lets the Glossary Inspector draw a
// progress bar: a single request can only report that it is still running, whereas a page at a
// time reports how many entries are done after every page.

export const REINDEX_PAGE = 1000;

export type ReindexPage = {
  // Rows written to the index by this page.
  indexed: number;
  // Rows in this page whose search_id was pointing somewhere else and has been corrected.
  repointed: number;
  // Cursor for the next call: the last id written. Null once there is nothing left.
  nextAfterId: string | null;
};

// Indexes one page of rows, resuming after `afterId`. Keyset rather than offset because rows
// can be created or deleted between calls, and an offset would then skip or repeat a page.
export const reindexGlossaryPage = async ({ afterId }: { afterId: string | null }): Promise<ReindexPage> => {
  const rows = await dbClient
    .select({
      id: glossariesTable.id,
      glossary: glossariesTable.glossary,
      phonetic: glossariesTable.phonetic,
      translations: glossariesTable.translations,
    })
    .from(glossariesTable)
    // Trashed entries stay out of search; restoring one indexes it again.
    .where(and(notTrashed, afterId ? sql`${glossariesTable.id} > ${afterId}::uuid` : undefined))
    .orderBy(glossariesTable.id)
    .limit(REINDEX_PAGE);

  if (rows.length === 0) return { indexed: 0, repointed: 0, nextAfterId: null };

  // saveObjects batches internally and overwrites by objectID.
  await algoliaClient.saveObjects({ indexName: 'glossaries', objects: rows.map(glossaryIndexRecord) });

  // Point search_id at the record just written. Raw SQL rather than the query builder because
  // updatedAt carries $onUpdate: re-indexing is not an edit, and stamping every row as edited
  // now would overwrite the real last-edited date of the whole glossary irrecoverably.
  const ids = rows.map((row) => row.id);
  const result = await dbClient.execute(
    sql`update ${glossariesTable} set search_id = id::text where ${glossariesTable.id} in ${ids} and ${glossariesTable.searchId} is distinct from ${glossariesTable.id}::text`,
  );

  return {
    indexed: rows.length,
    repointed: result.rowCount ?? 0,
    // A short page means the table ended here; anything else leaves the cursor at the last row.
    nextAfterId: rows.length < REINDEX_PAGE ? null : rows[rows.length - 1].id,
  };
};

// Empties the glossary table and drops its objects from the Algolia index.
// Destructive and irreversible — callers must gate this on the appropriate ability.
export const deleteAllGlossaries = async (): Promise<{ deleted: number }> => {
  // Only rows that were actually indexed carry a searchId.
  const rows = await dbClient
    .select({ searchId: glossariesTable.searchId })
    .from(glossariesTable)
    .where(isNotNull(glossariesTable.searchId));

  const objectIDs = rows.map((r) => r.searchId).filter((id): id is string => Boolean(id));

  // Remove only the objects this table owns rather than clearing the shared index. deleteObjects auto-batches.
  if (objectIDs.length > 0) {
    await algoliaClient.deleteObjects({ indexName: 'glossaries', objectIDs });
  }

  const deleted = await dbClient.delete(glossariesTable).returning({ id: glossariesTable.id });
  return { deleted: deleted.length };
};
