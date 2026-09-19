/**
 * What the glossary test fixtures are, with no idea how to write them anywhere.
 *
 * Every fixture is named after the thing it exists to test, so the inspector tells you what to
 * do without this file open beside it. They come in two sets:
 *
 *   ZZTEST-0n-DELETE-…  Things you get rid of by testing a button. Each one names the button
 *                       that removes it. When the set is empty, the buttons work.
 *
 *   ZZTEST-1n-ISSUE-…   Things the inspector only *reports*. Each one is named after the issue
 *                       code it raises, so the badge on the page matches the term. No button
 *                       sweeps these; they are there to show the check firing.
 *
 * Everything is prefixed ZZTEST, which sorts last, appears nowhere in the real glossary, and is
 * one lookup away in the inspector's search box. The fixture rows also carry recognisable
 * uuids — 0000fe57-0000-4000-8000-0000000000NN, where NN is the fixture number — and the stray
 * index records they need are written at objectIDs beginning `zztest-`, so nothing in the
 * inspector's tables is ambiguous about where it came from.
 *
 * Kept free of the database and Algolia, the same split as glossary.analyse.ts versus
 * glossary.inspect.ts: seed-glossary-fixtures.ts writes these, and tests/glossary.fixtures.test.ts
 * puts them through the real checks to confirm each still raises the issue its name promises.
 */
import { type CreateGlossary, type ReadGlossary } from '~/drizzle/tables';
import { glossaryIndexRecord } from '~/services/glossary.record';

export const FIXTURE_PREFIX = 'ZZTEST';

type Translation = NonNullable<ReadGlossary['translations']>[number];

// A record exactly as it is written to the index. Deliberately not built through
// glossaryIndexRecord for the broken ones: half the fixtures exist because a record does *not*
// match what that projection would produce, so they are spelled out here instead.
type IndexRecordLiteral = { objectID: string; id?: string; glossary?: string; phonetic?: string | null };

export type Fixture = {
  // The exact term as stored, which is also how you find it in the inspector's search box.
  term: string;
  // The button this fixture exists to exercise, or the check it exists to trip.
  tests: string;
  // What should happen when you do that.
  expect: string;
  row: Omit<CreateGlossary, 'createdBy' | 'updatedBy'> | null;
  records: IndexRecordLiteral[];
};

// Fixture row uuids. Valid hex, obviously synthetic, and the last digits are the fixture
// number — so a bare uuid in the inspector's objectID column is still self-identifying.
const rowId = (number: number) => `0000fe57-0000-4000-8000-${String(number).padStart(12, '0')}`;

// Uuids that match no row, for the records that are supposed to be orphans.
const deadId = (number: number) => `0000dead-0000-4000-8000-${String(number).padStart(12, '0')}`;

// ─── Fixture building blocks ─────────────────────────────────────────────────

// Stamped into the audit columns and every translation. The seed script replaces it with a
// real user id before building the fixtures, because those columns are NOT NULL and the
// glossary UI shows who last touched an entry.
let authorId = 'zztest-fixture';

export function setFixtureAuthorId(id: string) {
  authorId = id;
}

function translation(glossary: string, overrides: Partial<Translation> = {}): Translation {
  return {
    glossary,
    language: 'english',
    sutraName: 'ZZTEST Sutra',
    volume: '1',
    updatedBy: authorId,
    updatedAt: '2026-01-01',
    originSutraText: null,
    targetSutraText: null,
    author: 'ZZTEST fixtures',
    ...overrides,
  };
}

function row(number: number, term: string, overrides: Partial<CreateGlossary> = {}) {
  return {
    id: rowId(number),
    glossary: term,
    phonetic: `zztest ${number}`,
    author: 'ZZTEST fixtures',
    cbetaFrequency: '0',
    subscribers: 0,
    translations: [translation(`ZZTEST fixture ${number}`)],
    // Correct by default: search_id names the record at the row's own uuid. The fixtures that
    // exist because that is wrong override it.
    searchId: rowId(number),
    ...overrides,
  };
}

// The record a healthy row has: what glossaryIndexRecord would write for it.
function canonicalRecord(fixtureRow: NonNullable<Fixture['row']>): IndexRecordLiteral {
  return glossaryIndexRecord(fixtureRow as unknown as ReadGlossary) as IndexRecordLiteral;
}

// ─── Set 1: fixtures you remove by testing a button ──────────────────────────

export function deletableFixtures(): Fixture[] {
  const deleteWholeEntry = row(1, 'ZZTEST-01-DELETE-WHOLE-ENTRY', {
    translations: [
      translation('first translation — goes with the entry'),
      translation('second translation — also goes with the entry'),
    ],
    discussion: 'Fixture for “delete term from glossary”. Delete the whole entry to clear it.',
  });

  const deleteOneTranslation = row(2, 'ZZTEST-02-DELETE-ONE-TRANSLATION', {
    translations: [
      translation('KEEP ME — first translation'),
      translation('DELETE ME — remove this one and save'),
      translation('KEEP ME — third translation'),
    ],
    discussion:
      'Fixture for “delete translation from glossary”. Edit the entry, remove the DELETE ME translation, save. Admin only — a non-admin save that drops a translation must be refused.',
  });

  const duplicateRecords = row(3, 'ZZTEST-03-DELETE-DUPLICATE-SEARCH-RECORDS', {
    discussion:
      'Fixture for the duplicate-record cleanup. Three index records carry this row’s uuid, so search lists it three times and all three edit this one row.',
  });

  const orphanLiveTerm = row(4, 'ZZTEST-04-DELETE-ORPHAN-TERM-STILL-LIVE', {
    discussion:
      'Fixture for the orphan cleanup, live-term half. The row and its own record are healthy; a fourth record names a uuid that no longer exists, as an import that re-created the entry would leave behind.',
  });

  return [
    {
      term: deleteWholeEntry.glossary,
      row: deleteWholeEntry,
      records: [canonicalRecord(deleteWholeEntry)],
      tests: '/glossary → find the entry → trash button (admin only)',
      expect: 'The row and its one search record both go. The inspector stops reporting it entirely.',
    },
    {
      term: deleteOneTranslation.glossary,
      row: deleteOneTranslation,
      records: [canonicalRecord(deleteOneTranslation)],
      tests: '/glossary → find the entry → edit → remove the “DELETE ME” translation → save',
      expect:
        'The entry stays with 2 translations, and its index record loses the deleted one too — check the inspector’s translations table and the record beside it.',
    },
    {
      term: duplicateRecords.glossary,
      row: duplicateRecords,
      records: [
        canonicalRecord(duplicateRecords),
        // Same uuid, different objectID: this is exactly the shape that makes one entry appear
        // several times in search results.
        { objectID: 'zztest-03-duplicate-record-a', id: rowId(3), glossary: duplicateRecords.glossary },
        { objectID: 'zztest-03-duplicate-record-b', id: rowId(3), glossary: duplicateRecords.glossary },
      ],
      tests: 'Inspector → Check the search index → “Delete 2 duplicate records” (or the per-row trash buttons)',
      expect:
        'The two zztest-03-… records go, the record at the row’s own uuid is kept, and the entry is untouched. Its duplicate-index-record issue clears on the next check.',
    },
    {
      term: orphanLiveTerm.glossary,
      row: orphanLiveTerm,
      records: [
        canonicalRecord(orphanLiveTerm),
        // No row has this uuid, but the term it carries still exists above — the "orphan whose
        // term is still in the glossary" class.
        { objectID: 'zztest-04-orphan-record-live-term', id: deadId(4), glossary: orphanLiveTerm.glossary },
      ],
      tests: 'Inspector → “Delete 1 orphan records whose term is still in the glossary”',
      expect:
        'The zztest-04-… record goes. The live entry and its own record stay, so the term is still findable in search.',
    },
    {
      term: 'ZZTEST-05-DELETE-ORPHAN-TERM-GONE',
      // No row at all: this fixture is a record left behind by an entry that was deleted.
      row: null,
      records: [
        {
          objectID: 'zztest-05-orphan-record-term-gone',
          id: deadId(5),
          glossary: 'ZZTEST-05-DELETE-ORPHAN-TERM-GONE',
        },
      ],
      tests: 'Inspector → the red “Delete 1 orphan records whose term is gone”',
      expect:
        'The record goes and nothing in the database is involved. Before deleting, find it in the Orphan index records table — it should be badged “term not in glossary”.',
    },
  ];
}

// ─── Set 2: fixtures for the issues the inspector only reports ───────────────

export function issueFixtures(): Fixture[] {
  const notIndexed = row(11, 'ZZTEST-11-ISSUE-not-indexed', {
    // Never indexed, so no pointer and no record.
    searchId: null,
    discussion: 'Fixture for the not-indexed check: search_id is empty, so search cannot find this entry at all.',
  });

  const stalePointer = row(12, 'ZZTEST-12-ISSUE-stale-index-pointer', {
    searchId: 'zztest-12-pointer-to-nowhere',
    discussion:
      'Fixture for the stale-index-pointer check: search_id names a record that is not in the index, so saving an edit writes a partial record nobody can resolve.',
  });

  const mismatch = row(13, 'ZZTEST-13-ISSUE-search-id-mismatch', {
    searchId: 'zztest-13-partial-record-no-uuid',
    discussion:
      'Fixture for the search-id-mismatch check: the record search actually returns for this entry is not the one search_id points at, so edits land on a record nobody reads.',
  });

  const softDeleted = row(14, 'ZZTEST-14-ISSUE-soft-deleted', {
    deletedAt: new Date('2026-01-01'),
    discussion:
      'Fixture for the soft-deleted check: deleted_at is set, but no glossary query filters on it, so this entry is still served everywhere.',
  });

  // The two halves of a near-duplicate. The raw strings differ, so the unique index on the term
  // allows both; normalising for case folds them together, which is the point of the check.
  const nearDuplicateUpper = row(15, 'ZZTEST-15-ISSUE-NEAR-DUPLICATE-TERM', {
    discussion: 'Fixture for the near-duplicate-term check, upper-case half. Its twin is row …0016.',
  });
  const nearDuplicateLower = row(16, 'zztest-15-issue-near-duplicate-term', {
    discussion: 'Fixture for the near-duplicate-term check, lower-case half. Its twin is row …0015.',
  });

  // A zero-width space and a trailing ordinary space, so the check reports both of its clauses.
  const invisible = row(17, 'ZZTEST-17-ISSUE-term-has-invisible-characters\u200b ', {
    discussion:
      'Fixture for the term-has-invisible-characters check: the term ends in a zero-width space and a trailing space, so looking it up by the visible text misses it.',
  });

  const noTranslations = row(18, 'ZZTEST-18-ISSUE-no-translations', {
    translations: [],
    discussion: 'Fixture for the no-translations check: the entry exists but says nothing.',
  });

  const blankTranslation = row(19, 'ZZTEST-19-ISSUE-blank-translation', {
    translations: [translation('   '), translation('this translation has text')],
    discussion: 'Fixture for the blank-translation check: one of the two translations is whitespace only.',
  });

  return [
    {
      term: notIndexed.glossary,
      row: notIndexed,
      records: [],
      tests: 'Inspector → badge “not-indexed” on this entry',
      expect: 'Re-index repairs it: it gets a record at its own uuid and search_id starts pointing there.',
    },
    {
      term: stalePointer.glossary,
      row: stalePointer,
      records: [],
      tests: 'Inspector → badge “stale-index-pointer” on this entry',
      expect: 'Re-index repairs it. The dead pointer is simply overwritten with the row’s own uuid.',
    },
    {
      term: mismatch.glossary,
      row: mismatch,
      records: [
        // Exists in the index, so the pointer is not stale, but carries no uuid — search can
        // never resolve it back to the row. The row's search_id claims it, which is what keeps
        // it out of the orphan list.
        { objectID: 'zztest-13-partial-record-no-uuid', glossary: mismatch.glossary },
        // The record that does carry the uuid, at a different objectID.
        canonicalRecord(mismatch),
      ],
      tests: 'Inspector → badge “search-id-mismatch” on this entry',
      expect:
        'Re-index repairs the row. Watch what it leaves: zztest-13-partial-record-no-uuid is no longer claimed by anything, so the next index check reports it as an orphan whose term is still live — the hand-off between the two buttons.',
    },
    {
      term: softDeleted.glossary,
      row: softDeleted,
      records: [canonicalRecord(softDeleted)],
      tests: 'Inspector → badge “soft-deleted” on this entry',
      expect: 'Nothing repairs this one. It is a report that the entry is still served despite deleted_at being set.',
    },
    {
      term: nearDuplicateUpper.glossary,
      row: nearDuplicateUpper,
      records: [canonicalRecord(nearDuplicateUpper)],
      tests: 'Inspector → badge “near-duplicate-term” on both halves of the pair',
      expect: 'Two genuinely separate rows. Deleting one does not affect the other — the badge says so.',
    },
    {
      term: nearDuplicateLower.glossary,
      row: nearDuplicateLower,
      records: [canonicalRecord(nearDuplicateLower)],
      tests: 'Inspector → the lower-case half of the near-duplicate-term pair',
      expect: 'Reported alongside row …0015. Look up “ZZTEST-15” to see both at once.',
    },
    {
      term: invisible.glossary,
      row: invisible,
      records: [canonicalRecord(invisible)],
      tests: 'Inspector → badge “term-has-invisible-characters” on this entry',
      expect:
        'Search the inspector for ZZTEST-17 to find it; searching for the visible term with a plain trailing space will not match.',
    },
    {
      term: noTranslations.glossary,
      row: noTranslations,
      records: [canonicalRecord(noTranslations)],
      tests: 'Inspector → badge “no-translations” on this entry',
      expect: 'The translations (json) section reads “No translations stored.”',
    },
    {
      term: blankTranslation.glossary,
      row: blankTranslation,
      records: [canonicalRecord(blankTranslation)],
      tests: 'Inspector → badge “blank-translation” on this entry',
      expect: 'The translations table shows one row whose glossary is whitespace and one with real text.',
    },
  ];
}
