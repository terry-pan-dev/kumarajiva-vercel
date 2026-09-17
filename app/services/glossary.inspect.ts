// Data fetching for the glossary inspector: reads every glossary row and every record in the
// Algolia index, then hands both to the checks in glossary.analyse.ts. Read-only — nothing
// here writes to the database or the index.
import { inArray, sql } from 'drizzle-orm';

import { glossariesTable, type ReadGlossary } from '~/drizzle/tables';
import { getDb } from '~/lib/db.server';
import algoliaClient from '~/providers/algolia';

import {
  analyseGlossary,
  type GlossaryInspection,
  type IndexRecord,
  type RemovableRecordClass,
} from './glossary.analyse';

const dbClient = getDb();

const INDEX_NAME = 'glossaries';

async function readIndexRecords(): Promise<IndexRecord[]> {
  const exists = await algoliaClient.indexExists({ indexName: INDEX_NAME });
  if (!exists) return [];

  const records: IndexRecord[] = [];
  await algoliaClient.browseObjects<IndexRecord>({
    indexName: INDEX_NAME,
    browseParams: { query: '', hitsPerPage: 1000, attributesToRetrieve: ['id', 'glossary'] },
    aggregator: (response) => {
      records.push(...response.hits);
    },
  });
  return records;
}

// Scanning the index means browsing every record — tens of thousands of them, tens of
// seconds — so the caller opts in. Without it the row-level checks still run.
export async function inspectGlossary({ checkIndex }: { checkIndex: boolean }): Promise<GlossaryInspection> {
  const rows = await dbClient.select().from(glossariesTable).orderBy(glossariesTable.glossary);

  if (!checkIndex) {
    return analyseGlossary({ rows, indexRecords: null });
  }

  // A missing or unreachable index is reported rather than thrown: the row-level checks are
  // still worth showing, and "no index records" must not read as "nothing is indexed".
  let indexRecords: IndexRecord[] | null = null;
  let indexError: string | null = null;
  try {
    indexRecords = await readIndexRecords();
  } catch (error) {
    indexError = error instanceof Error ? error.message : 'Could not read the search index.';
  }

  return analyseGlossary({ rows, indexRecords, indexError });
}

// Lookup for the inspector's search box: an exact uuid or search_id, or any term or
// translation containing the query. Returns whole rows — the inspector shows every column.
export async function findGlossaryRowsForInspection(query: string, limit = 50): Promise<ReadGlossary[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed);
  if (isUuid) {
    return dbClient
      .select()
      .from(glossariesTable)
      .where(sql`${glossariesTable.id} = ${trimmed}::uuid`);
  }

  const pattern = `%${trimmed}%`;
  return dbClient
    .select()
    .from(glossariesTable)
    .where(
      sql`${glossariesTable.glossary} ILIKE ${pattern} OR ${glossariesTable.searchId} = ${trimmed} OR ${glossariesTable.translations}::text ILIKE ${pattern}`,
    )
    .orderBy(glossariesTable.glossary)
    .limit(limit);
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────

export type RecordDeletionResult = {
  deleted: string[];
  // Records the server refused to delete, with the reason. Shown rather than swallowed: a
  // refusal means the page's view of the index was out of date.
  skipped: { objectID: string; reason: string }[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Algolia caps getObjects at 1000 requests per call.
const GET_OBJECTS_BATCH = 1000;

async function fetchRecords(objectIDs: string[]): Promise<Map<string, IndexRecord>> {
  const found = new Map<string, IndexRecord>();
  for (let start = 0; start < objectIDs.length; start += GET_OBJECTS_BATCH) {
    const batch = objectIDs.slice(start, start + GET_OBJECTS_BATCH);
    const { results } = await algoliaClient.getObjects<IndexRecord | null>({
      requests: batch.map((objectID) => ({ indexName: INDEX_NAME, objectID, attributesToRetrieve: ['id'] })),
    });
    results.forEach((record, position) => {
      if (record) found.set(batch[position], { ...record, objectID: batch[position] });
    });
  }
  return found;
}

// Deletes index records the caller believes are redundant or orphaned, re-deriving that
// judgement here rather than trusting the request: the page may have been rendered before
// another admin's cleanup, and a wrong delete silently removes an entry from search.
//
// A record may go only when it is not the canonical record of any row, and — if it belongs to
// a row at all — that row's canonical record still exists to take over.
export async function deleteIndexRecords(objectIDs: string[]): Promise<RecordDeletionResult> {
  const requested = [...new Set(objectIDs)].filter(Boolean);
  if (requested.length === 0) return { deleted: [], skipped: [] };

  const records = await fetchRecords(requested);

  // The rows these records claim, and any row already pointing at one of the requested
  // objectIDs — the two ways a record can turn out to be load-bearing.
  const claimedRowIds = [...records.values()]
    .map((record) => record.id)
    .filter((id): id is string => UUID.test(id ?? ''));
  const [claimedRows, rowsPointingAtRequested] = await Promise.all([
    claimedRowIds.length
      ? dbClient.select().from(glossariesTable).where(inArray(glossariesTable.id, claimedRowIds))
      : Promise.resolve([]),
    dbClient.select().from(glossariesTable).where(inArray(glossariesTable.searchId, requested)),
  ]);

  const rowById = new Map(claimedRows.map((row) => [row.id, row]));
  const rowBySearchId = new Map(rowsPointingAtRequested.map((row) => [row.searchId as string, row]));

  // Which canonical records actually exist, for rows whose duplicates are up for deletion.
  const canonicalIds = [...new Set(claimedRows.map((row) => row.searchId).filter((id): id is string => Boolean(id)))];
  const existingCanonical = await fetchRecords(canonicalIds.filter((id) => !requested.includes(id)));

  const deleted: string[] = [];
  const skipped: RecordDeletionResult['skipped'] = [];

  for (const objectID of requested) {
    const record = records.get(objectID);
    if (!record) {
      skipped.push({ objectID, reason: 'no longer in the index' });
      continue;
    }
    if (rowBySearchId.has(objectID)) {
      skipped.push({ objectID, reason: 'this is the record an entry points at, so search needs it' });
      continue;
    }
    const owner = record.id ? rowById.get(record.id) : undefined;
    if (owner) {
      const canonicalExists = Boolean(owner.searchId) && existingCanonical.has(owner.searchId as string);
      if (!canonicalExists) {
        skipped.push({
          objectID,
          reason: `“${owner.glossary}” has no other index record, so deleting this one would drop it from search`,
        });
        continue;
      }
    }
    deleted.push(objectID);
  }

  if (deleted.length > 0) {
    await algoliaClient.deleteObjects({ indexName: INDEX_NAME, objectIDs: deleted });
  }
  return { deleted, skipped };
}

// Bulk cleanup of one class of record: rescans, then deletes what the fresh scan puts in that
// class. The set is recomputed here rather than taken from the page, and the full browse it
// comes from is stronger evidence than the per-record checks in deleteIndexRecords — every
// record for every row was just seen — so this path deletes on the scan's judgement directly.
export async function deleteRemovableIndexRecords(
  recordClass: RemovableRecordClass,
): Promise<{ deleted: number; scanned: number }> {
  const inspection = await inspectGlossary({ checkIndex: true });
  if (inspection.indexError) {
    throw new Error(inspection.indexError);
  }
  const objectIDs = inspection.removable[recordClass];
  if (objectIDs.length > 0) {
    // deleteObjects batches internally.
    await algoliaClient.deleteObjects({ indexName: INDEX_NAME, objectIDs });
  }
  return { deleted: objectIDs.length, scanned: inspection.stats.indexRecords };
}
