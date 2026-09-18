// The projection of a glossary row into its Algolia record: the one place the search index's
// shape is defined. Changing what search holds is a change here plus a re-index, and nowhere
// else — which is what makes re-indexing after a schema change a mechanical step.
//
// Kept free of the database and Algolia, the same split as glossary.analyse.ts and
// glossary.merge.ts, so the shape can be unit-tested on plain fixtures.
import { type ReadGlossary } from '~/drizzle/tables';

// Phonetics are indexed with their diacritics stripped, so a search for "dharma" also matches
// one stored as "dhárma". NFD splits each accented character into its base letter plus a
// combining mark, and the escaped range is those marks.
//
// Shared by every path that writes a phonetic to the index, so the two cannot drift apart: an
// entry indexed on create and the same entry after an edit have to normalise identically, or
// searches stop matching whichever rows happen to have been edited.
export const searchablePhonetic = (phonetic: string | null | undefined): string | null =>
  phonetic ? phonetic.normalize('NFD').replace(/[̀-ͯ]/g, '') : null;

// The objectID is the row's own uuid rather than a generated id. Indexing the same entry again
// therefore overwrites its record instead of minting a second one carrying the same uuid, so an
// import that runs twice can no longer double-list every entry it touches. It also makes
// search_id derivable — it is always the uuid — though the column is still written until the
// code reading it goes. Rows indexed before this keep their generated objectIDs, which stay
// valid until a re-index moves them.
//
// Only the fields search needs are carried. The sutra citations on a translation are
// deliberately left out: they are shown from the row once a hit resolves back to it.
export const glossaryIndexRecord = (row: Pick<ReadGlossary, 'id' | 'glossary' | 'phonetic' | 'translations'>) => ({
  objectID: row.id,
  id: row.id,
  phonetic: searchablePhonetic(row.phonetic),
  glossary: row.glossary,
  translations: row.translations?.map((translation) => ({
    glossary: translation.glossary,
    language: translation.language,
  })),
});
