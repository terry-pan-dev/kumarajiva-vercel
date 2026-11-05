// The projection of a paragraphs_new row into its Algolia record: the one place the paragraph
// search index's shape is defined. Every write path (the translation editor, the import and the
// full rebuild) goes through here, so a record written by one cannot differ from a record
// written by another. Changing what search holds is a change here plus a rebuild.
//
// Kept free of the database and Algolia, like glossary.record.ts, so the shape can be
// unit-tested on plain fixtures.
import { type ReadParagraphNew } from '~/drizzle/tables';

export const PARAGRAPH_INDEX = 'paragraphs';

// Only what search needs. `content` is what is searched; the ids let a hit be resolved back to
// its row, which is where everything shown in a result comes from. Audit fields and metadata
// stay out: they are read from the row, and copying them here only lets the two disagree.
const INDEXED_FIELDS = ['id', 'content', 'documentId', 'sectionId', 'passageKey', 'order'] as const;

type IndexedField = (typeof INDEXED_FIELDS)[number];

// How the index searches its records — kept here with the record shape, and applied to the index
// by every rebuild, so dev and prod cannot drift apart through dashboard edits.
//   searchableAttributes: only the text is searched. Left unset, Algolia searches every
//     attribute, so a query could match a uuid, a passage key or an order.
//   typoTolerance 'min': results with typos only appear when nothing matches with fewer, so
//     "Thus I have heard" no longer brings in "this … have … hard".
//   advancedSyntax: a "quoted phrase" must match as a phrase, and -word excludes a word.
export const PARAGRAPH_INDEX_SETTINGS = {
  searchableAttributes: ['content'],
  typoTolerance: 'min',
  advancedSyntax: true,
} as const;

export type ParagraphIndexSetting = keyof typeof PARAGRAPH_INDEX_SETTINGS;

// The settings whose live value differs from PARAGRAPH_INDEX_SETTINGS. Unset values count as
// different, since Algolia's defaults are not what we want.
export function settingsToChange(live: Partial<Record<ParagraphIndexSetting, unknown>>): ParagraphIndexSetting[] {
  return (Object.keys(PARAGRAPH_INDEX_SETTINGS) as ParagraphIndexSetting[]).filter(
    (key) => JSON.stringify(live[key] ?? null) !== JSON.stringify(PARAGRAPH_INDEX_SETTINGS[key]),
  );
}

export type ParagraphIndexRecord = Pick<ReadParagraphNew, IndexedField> & { objectID: string };

export type IndexableParagraph = Pick<ReadParagraphNew, IndexedField | 'searchId'>;

// The objectID is the row's existing search_id, which every row already has and the editor's
// incremental updates already address. A row without one cannot be indexed (there is nothing to
// address it by later), so it yields null and the caller decides how to report it.
export function paragraphIndexRecord(row: IndexableParagraph): ParagraphIndexRecord | null {
  if (!row.searchId) return null;
  return {
    objectID: row.searchId,
    id: row.id,
    content: row.content,
    documentId: row.documentId,
    sectionId: row.sectionId,
    passageKey: row.passageKey ?? null,
    order: row.order,
  };
}

export type IndexRecordSet = {
  records: ParagraphIndexRecord[];
  // Rows with no search_id: they cannot be indexed and need one assigned first.
  withoutSearchId: string[];
  // Rows whose search_id an earlier row already uses. Indexing both would make the second
  // overwrite the first, silently dropping a paragraph from search, so only the first is kept.
  duplicateSearchId: { id: string; searchId: string }[];
};

// Every record a full rebuild writes, from every row, with the rows that cannot be indexed
// reported rather than dropped silently.
export function buildIndexRecords(rows: Iterable<IndexableParagraph>): IndexRecordSet {
  const set: IndexRecordSet = { records: [], withoutSearchId: [], duplicateSearchId: [] };
  const usedSearchIds = new Set<string>();
  for (const row of rows) {
    const record = paragraphIndexRecord(row);
    if (!record) {
      set.withoutSearchId.push(row.id);
    } else if (usedSearchIds.has(record.objectID)) {
      set.duplicateSearchId.push({ id: row.id, searchId: record.objectID });
    } else {
      usedSearchIds.add(record.objectID);
      set.records.push(record);
    }
  }
  return set;
}
