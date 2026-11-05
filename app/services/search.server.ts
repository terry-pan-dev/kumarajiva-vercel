import type { SearchQuery } from '@algolia/client-search';

import 'dotenv/config';

import { type SearchResultListProps } from '~/components/SideBarMenu';
import algoliaClient from '~/providers/algolia';

import { GlossaryStore } from './glossary.store';
import {
  buildIndexRecords,
  type IndexableParagraph,
  PARAGRAPH_INDEX,
  PARAGRAPH_INDEX_SETTINGS,
  paragraphIndexRecord,
  type ParagraphIndexSetting,
  settingsToChange,
} from './paragraph.record';
import { assembleParagraphSearchResults, type ParagraphSearchResult } from './paragraph.search';
import { DbParagraphsNew } from './text.crud';

export type { ParagraphSearchResult } from './paragraph.search';

// Headroom for glossary queries: index records can outnumber entries, so ask for more hits
// than needed and collapse duplicates afterwards.
const GLOSSARY_HIT_OVERFETCH = 3;

// Headroom for paragraph queries: a hit on a parked row or a stale record is dropped when it
// resolves, so ask for a few more than are shown.
const PARAGRAPH_HIT_OVERFETCH = 2;

// Resolves paragraph hits to paragraphs_new rows and pairs each with the same passage in the
// work's other documents. Hits that no longer resolve (stale records) are dropped.
const queryParagraphs = async (hitIds: string[], limit: number): Promise<ParagraphSearchResult[]> => {
  const rows = await DbParagraphsNew.findByIdsWithRelations(hitIds);
  const workIds = [...new Set(rows.map((row) => row.document.workId))];
  const passageKeys = [...new Set(rows.map((row) => row.passageKey).filter((key): key is string => Boolean(key)))];
  const candidates = await DbParagraphsNew.findAlignedCandidates(workIds, passageKeys);
  return assembleParagraphSearchResults({ hitIds, rows, candidates, limit });
};

export const searchAlgolia = async ({
  searchTerm,
  searchType,
}: {
  searchTerm: string;
  searchType?: 'Glossary' | 'Paragraph' | null;
}): Promise<SearchResultListProps['results']> => {
  const numberOfHits = 10;
  const paragraphsIndexExist = await algoliaClient.indexExists({ indexName: PARAGRAPH_INDEX });
  const glossariesIndexExist = await algoliaClient.indexExists({ indexName: 'glossaries' });
  if (!paragraphsIndexExist && !glossariesIndexExist) {
    return [];
  }
  const paragraphQuery: SearchQuery = {
    indexName: PARAGRAPH_INDEX,
    query: searchTerm,
    hitsPerPage: numberOfHits * PARAGRAPH_HIT_OVERFETCH,
  };
  // Over-fetched: duplicate index records collapse to one entry below, and without the
  // headroom a page of hits can thin out to half as many distinct entries.
  const glossaryQuery: SearchQuery = {
    indexName: 'glossaries',
    query: searchTerm,
    hitsPerPage: numberOfHits * GLOSSARY_HIT_OVERFETCH,
  };
  const searchQuery: SearchQuery[] =
    searchType === 'Paragraph'
      ? [paragraphQuery]
      : searchType === 'Glossary'
        ? [glossaryQuery]
        : [paragraphQuery, glossaryQuery];

  const { results } = await algoliaClient.search<{ id: string }>({
    requests: searchQuery,
  });

  let searchResults: SearchResultListProps['results'] = [];
  if (results.length) {
    for (const result of results) {
      if ('hits' in result) {
        if (result.index === PARAGRAPH_INDEX) {
          const paragraphs = await queryParagraphs(result.hits.map((hit) => hit.id).filter(Boolean), numberOfHits);
          searchResults.push(...paragraphs.map((p) => ({ ...p, type: 'Paragraph' as const })));
        }
        if (result.index === 'glossaries') {
          // One entry can be reachable through several index records — duplicates left by
          // earlier imports. Collapsing on the uuid keeps it a single result; without this the
          // same entry renders as two identical cards that both edit the same row.
          const ids = [...new Set(result.hits.map((hit) => hit.id))].slice(0, numberOfHits);
          const glossaries = await GlossaryStore.findByIdsInOrder(ids);
          searchResults.push(...glossaries.map((g) => ({ ...g, type: 'Glossary' as const })));
        }
      }
    }
  }
  return searchResults;
};

// ─── paragraphs_new → index ──────────────────────────────────────────────────
// Every write of a paragraphs_new row saves its whole record, built by paragraphIndexRecord.
// A whole-record save is an upsert: it also repairs a record that is missing or out of date,
// where a partial update would create a record holding only the changed fields.

// Saves the index record of each row. Rows without a search_id are skipped (there is nothing
// to address their record by); a full rebuild reports them.
export const indexParagraphs = async (rows: IndexableParagraph[]): Promise<void> => {
  const objects = rows.map(paragraphIndexRecord).filter((record) => record !== null);
  if (!objects.length) return;
  await algoliaClient.saveObjects({ indexName: PARAGRAPH_INDEX, objects });
};

// Removes the records of deleted paragraphs.
export const deleteParagraphsFromAlgolia = async (searchIds: (string | null | undefined)[]): Promise<void> => {
  const objectIDs = searchIds.filter((id): id is string => Boolean(id));
  if (!objectIDs.length) return;
  await algoliaClient.deleteObjects({ indexName: PARAGRAPH_INDEX, objectIDs });
};

export const REBUILD_PAGE = 1000;

export type ParagraphIndexRebuild = {
  applied: boolean;
  // Rows read from paragraphs_new, parked rows included.
  rows: number;
  // Records the rebuilt index holds (or would hold, on a dry run).
  records: number;
  withoutSearchId: string[];
  duplicateSearchId: { id: string; searchId: string }[];
  // Records in the index before the rebuild; 0 when the index did not exist.
  recordsBefore: number;
  // Index settings that differ from PARAGRAPH_INDEX_SETTINGS (and are set, when applied).
  settingsChanged: ParagraphIndexSetting[];
  // The live value of each configured setting before the rebuild; absent when unset.
  liveSettings: Partial<Record<ParagraphIndexSetting, unknown>>;
};

// Rebuilds the paragraph index from paragraphs_new: afterwards it holds exactly one record per
// row, and nothing else — stale records, duplicates and legacy-paragraph records are all gone —
// and searches with PARAGRAPH_INDEX_SETTINGS.
//
// The swap is atomic: replaceAllObjects fills a temporary copy of the index (keeping its
// settings, rules and synonyms) and moves it over the live one, so searches never see a
// half-built index. A paragraph written while the rebuild runs can miss the new index; run it
// when nobody is editing, or run it again.
//
// Without `apply` nothing is written: the result says what a rebuild would do.
export const rebuildParagraphIndex = async ({ apply }: { apply: boolean }): Promise<ParagraphIndexRebuild> => {
  const rows: IndexableParagraph[] = [];
  let afterId: string | null = null;
  for (;;) {
    const page: IndexableParagraph[] = await DbParagraphsNew.findPageForIndex(afterId, REBUILD_PAGE);
    rows.push(...page);
    if (page.length < REBUILD_PAGE) break;
    afterId = page[page.length - 1].id;
  }
  const { records, withoutSearchId, duplicateSearchId } = buildIndexRecords(rows);

  const indexExists = await algoliaClient.indexExists({ indexName: PARAGRAPH_INDEX });
  const recordsBefore = indexExists
    ? ((
        await algoliaClient.searchSingleIndex({
          indexName: PARAGRAPH_INDEX,
          searchParams: { query: '', hitsPerPage: 0 },
        })
      ).nbHits ?? 0)
    : 0;
  const live: Partial<Record<ParagraphIndexSetting, unknown>> = indexExists
    ? await algoliaClient.getSettings({ indexName: PARAGRAPH_INDEX })
    : {};
  const liveSettings = Object.fromEntries(
    (Object.keys(PARAGRAPH_INDEX_SETTINGS) as ParagraphIndexSetting[])
      .filter((key) => live[key] !== undefined)
      .map((key) => [key, live[key]]),
  );
  const settingsChanged = settingsToChange(live);

  if (apply) {
    // Settings go first, on the live index: replaceAllObjects copies the live index's settings
    // onto the copy it swaps in, so settings set afterwards would be applied to the old index.
    // Always set, even when unchanged: it is idempotent, and creates the index if it is missing.
    const { taskID } = await algoliaClient.setSettings({
      indexName: PARAGRAPH_INDEX,
      indexSettings: {
        ...PARAGRAPH_INDEX_SETTINGS,
        searchableAttributes: [...PARAGRAPH_INDEX_SETTINGS.searchableAttributes],
      },
    });
    await algoliaClient.waitForTask({ indexName: PARAGRAPH_INDEX, taskID });

    if (indexExists) {
      await algoliaClient.replaceAllObjects({ indexName: PARAGRAPH_INDEX, objects: records, batchSize: REBUILD_PAGE });
    } else {
      // Nothing to swap with: replaceAllObjects starts by copying the live index.
      await algoliaClient.saveObjects({ indexName: PARAGRAPH_INDEX, objects: records, waitForTasks: true });
    }
  }

  return {
    applied: apply,
    rows: rows.length,
    records: records.length,
    withoutSearchId,
    duplicateSearchId,
    recordsBefore,
    settingsChanged,
    liveSettings,
  };
};
