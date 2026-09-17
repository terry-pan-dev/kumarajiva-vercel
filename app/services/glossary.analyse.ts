// The glossary data checks behind /data/glossary/inspector, kept free of the database and
// Algolia so they can be unit-tested on plain fixtures. The fetching lives in
// glossary.inspect.ts, the same split as glossary.merge.ts vs glossary.service.ts.
//
// The model these checks are written against: each row owns exactly one Algolia record. The
// row stores that record's objectID in search_id, and the record carries the row's uuid in
// its `id` attribute. Every check below is a way that pairing breaks — and the reason one
// entry can appear several times in search results while all copies edit the same row.
import { type ReadGlossary } from '~/drizzle/tables';

import { translationKey } from './glossary.merge';

// Cap on entries returned with their full column dump, so one badly broken import can't
// produce a response too large to render. The counts in `stats` always cover everything.
export const MAX_REPORTED_ENTRIES = 300;
export const MAX_REPORTED_ORPHANS = 200;

export type GlossaryIssueCode =
  | 'duplicate-index-record'
  | 'search-id-mismatch'
  | 'stale-index-pointer'
  | 'not-indexed'
  | 'soft-deleted'
  | 'near-duplicate-term'
  | 'term-has-invisible-characters'
  | 'no-translations'
  | 'duplicate-translation'
  | 'blank-translation';

export type GlossaryIssue = {
  code: GlossaryIssueCode;
  severity: 'error' | 'warning';
  detail: string;
};

// What the index holds for one record. `id` is the uuid of the row it should belong to; it is
// absent on records a partial update created from nothing.
export type IndexRecord = {
  objectID: string;
  id?: string;
  glossary?: string;
};

// An index record seen from the row it claims. `canonical` is the one the row's search_id
// points at — the record search results actually resolve through. `removable` marks the rest,
// but only once a canonical record is known to exist: deleting every record for a row would
// drop it out of search entirely, which is worse than the duplicate being fixed.
export type EntryIndexRecord = IndexRecord & {
  canonical: boolean;
  removable: boolean;
};

// An index record no row claims. Whether the *term* still exists — under a different uuid —
// says which kind of leftover it is: an entry re-created by an import that minted new uuids
// (the live entry has its own record, so search is unaffected), or a term that has gone from
// the glossary altogether, where this record is the last trace of it.
export type OrphanIndexRecord = IndexRecord & {
  liveRowWithSameTerm: { id: string; glossary: string } | null;
};

// The three kinds of record that can be deleted, each with its own risk profile, so the
// inspector can offer them as separate bulk actions rather than one undifferentiated sweep.
//   duplicates          — the entry keeps the record search_id names; nothing leaves search.
//   orphans-live-term   — the term still exists under another uuid, which has its own record.
//   orphans-missing-term— nothing in the glossary holds this term any more, so the record is
//                         the last trace of it. Deleting is safe for search and destroys the
//                         only evidence of what was lost.
export type RemovableRecordClass = 'duplicates' | 'orphans-live-term' | 'orphans-missing-term';

export const REMOVABLE_RECORD_CLASSES: RemovableRecordClass[] = [
  'duplicates',
  'orphans-live-term',
  'orphans-missing-term',
];

export type InspectedEntry = {
  row: ReadGlossary;
  issues: GlossaryIssue[];
  // Every index record carrying this row's uuid — more than one is what makes the entry
  // appear repeatedly in search results.
  indexRecords: EntryIndexRecord[];
};

export type GlossaryInspection = {
  stats: {
    entries: number;
    translations: number;
    indexedEntries: number;
    indexRecords: number;
    orphanIndexRecords: number;
    // Extra records on entries that still have a canonical one: deletable without changing
    // what search can find.
    redundantIndexRecords: number;
    // Orphans whose term is still in the glossary under another uuid — leftovers of a
    // re-created entry rather than evidence of a lost one.
    orphansWithLiveTerm: number;
    entriesWithIssues: number;
    issueCounts: Record<GlossaryIssueCode, number>;
  };
  entries: InspectedEntry[];
  truncatedEntries: boolean;
  // Records in the index that no row claims. They are invisible until a re-import reuses
  // their uuid, at which point they become a duplicate.
  orphanIndexRecords: OrphanIndexRecord[];
  truncatedOrphans: boolean;
  // Every objectID that may be deleted, grouped by class, across the whole index rather than
  // just the entries reported above. Kept off the page payload by the loader, which sends only
  // the counts; the cleanup action recomputes the lists server-side.
  removable: Record<RemovableRecordClass, string[]>;
  // Set when the index could not be read; index checks are then skipped rather than reported
  // as clean.
  indexError: string | null;
  // False when the index was not consulted at all — scanning it is slow, so the inspector
  // makes it opt-in. Distinct from indexError, which means the scan was tried and failed.
  indexChecked: boolean;
};

// Characters that make two terms look identical while comparing as different: surrounding
// whitespace, zero-width joiners and marks, and the BOM.
const INVISIBLE = /[​-‏‪-‮⁠﻿]/;

function describeInvisible(term: string): string | null {
  const problems: string[] = [];
  if (term !== term.trim()) problems.push('leading or trailing whitespace');
  if (INVISIBLE.test(term)) problems.push('zero-width or direction-marking characters');
  return problems.length ? problems.join(' and ') : null;
}

// The comparison that decides whether two distinct rows are "the same term". Compatibility
// normalisation folds full-width forms onto their ASCII equivalents, which is one way the
// same term gets stored twice despite the unique index on the raw string.
export function normaliseTerm(term: string): string {
  return term.normalize('NFKC').trim().toLowerCase();
}

function emptyIssueCounts(): Record<GlossaryIssueCode, number> {
  return {
    'duplicate-index-record': 0,
    'search-id-mismatch': 0,
    'stale-index-pointer': 0,
    'not-indexed': 0,
    'soft-deleted': 0,
    'near-duplicate-term': 0,
    'term-has-invisible-characters': 0,
    'no-translations': 0,
    'duplicate-translation': 0,
    'blank-translation': 0,
  };
}

export function analyseGlossary({
  rows,
  // null means the index was not read: every index check is skipped, rather than an empty
  // list being mistaken for "nothing is indexed".
  indexRecords,
  indexError = null,
}: {
  rows: ReadGlossary[];
  indexRecords: IndexRecord[] | null;
  indexError?: string | null;
}): GlossaryInspection {
  const records = indexRecords ?? [];
  const indexReadable = indexRecords !== null && indexError === null;

  // uuid → the records claiming it, and objectID → record, for the two directions of lookup.
  const recordsByEntryId = new Map<string, IndexRecord[]>();
  const recordsByObjectId = new Map<string, IndexRecord>();
  for (const record of records) {
    recordsByObjectId.set(record.objectID, record);
    if (!record.id) continue;
    const list = recordsByEntryId.get(record.id) ?? [];
    list.push(record);
    recordsByEntryId.set(record.id, list);
  }

  // Rows sharing a normalised term: near-duplicates the unique index cannot catch, and the
  // lookup that tells an orphaned record whether its term still exists elsewhere.
  const idsByNormalisedTerm = new Map<string, string[]>();
  const rowByNormalisedTerm = new Map<string, { id: string; glossary: string }>();
  for (const row of rows) {
    const key = normaliseTerm(row.glossary);
    const list = idsByNormalisedTerm.get(key) ?? [];
    list.push(row.id);
    idsByNormalisedTerm.set(key, list);
    if (!rowByNormalisedTerm.has(key)) rowByNormalisedTerm.set(key, { id: row.id, glossary: row.glossary });
  }

  const issueCounts = emptyIssueCounts();
  const inspected: InspectedEntry[] = [];
  const claimedObjectIds = new Set<string>();
  const removable: Record<RemovableRecordClass, string[]> = {
    duplicates: [],
    'orphans-live-term': [],
    'orphans-missing-term': [],
  };
  let translations = 0;
  let indexedEntries = 0;
  let redundantIndexRecords = 0;

  for (const row of rows) {
    const issues: GlossaryIssue[] = [];
    const rawRecords = recordsByEntryId.get(row.id) ?? [];
    for (const record of rawRecords) claimedObjectIds.add(record.objectID);
    if (row.searchId) {
      indexedEntries++;
      claimedObjectIds.add(row.searchId);
    }

    const hasCanonical = Boolean(row.searchId) && rawRecords.some((record) => record.objectID === row.searchId);
    const entryRecords: EntryIndexRecord[] = rawRecords.map((record) => {
      const canonical = record.objectID === row.searchId;
      return { ...record, canonical, removable: !canonical && hasCanonical };
    });
    for (const record of entryRecords) {
      if (!record.removable) continue;
      redundantIndexRecords++;
      removable.duplicates.push(record.objectID);
    }

    if (!row.searchId) {
      issues.push({
        code: 'not-indexed',
        severity: 'warning',
        detail: 'search_id is empty, so this entry was never indexed and cannot be found by search.',
      });
    }

    if (indexReadable) {
      if (entryRecords.length > 1) {
        issues.push({
          code: 'duplicate-index-record',
          severity: 'error',
          detail: `${entryRecords.length} search records carry this uuid, so the entry appears ${entryRecords.length} times in search results. Every copy is this one row: editing any of them edits all of them.`,
        });
      }
      if (row.searchId && !recordsByObjectId.has(row.searchId)) {
        issues.push({
          code: 'stale-index-pointer',
          severity: 'error',
          detail:
            'search_id points at a record that no longer exists. Saving an edit recreates it as a partial record with no uuid, which search can never resolve back to this row.',
        });
      } else if (row.searchId && entryRecords.length > 0 && !entryRecords.some((r) => r.objectID === row.searchId)) {
        issues.push({
          code: 'search-id-mismatch',
          severity: 'error',
          detail:
            'The record search returns for this entry is not the one search_id points at, so edits update a record nobody reads and search keeps serving stale text.',
        });
      }
    }

    if (row.deletedAt) {
      issues.push({
        code: 'soft-deleted',
        severity: 'warning',
        detail: 'deleted_at is set, but no glossary query filters on it, so this entry is still served everywhere.',
      });
    }

    const sameTerm = (idsByNormalisedTerm.get(normaliseTerm(row.glossary)) ?? []).filter((id) => id !== row.id);
    if (sameTerm.length > 0) {
      issues.push({
        code: 'near-duplicate-term',
        severity: 'error',
        detail: `${sameTerm.length} other row(s) hold the same term once case, width and surrounding space are ignored. These are genuinely separate rows with separate uuids — deleting one does not affect the other.`,
      });
    }

    const invisible = describeInvisible(row.glossary);
    if (invisible) {
      issues.push({
        code: 'term-has-invisible-characters',
        severity: 'warning',
        detail: `The term contains ${invisible}, so lookups by the visible text will miss it.`,
      });
    }

    const rowTranslations = row.translations ?? [];
    translations += rowTranslations.length;
    if (rowTranslations.length === 0) {
      issues.push({ code: 'no-translations', severity: 'warning', detail: 'The entry has no translations.' });
    }

    // The importer's identity for a translation: term + source + volume. Two stored entries
    // with the same key are the duplicate the next import would silently collapse.
    const keyCounts = new Map<string, number>();
    for (const translation of rowTranslations) {
      const key = translationKey(translation);
      keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
    }
    const duplicateKeys = [...keyCounts.values()].filter((count) => count > 1).length;
    if (duplicateKeys > 0) {
      issues.push({
        code: 'duplicate-translation',
        severity: 'warning',
        detail: `${duplicateKeys} translation(s) repeat the same term, source and volume. The next import will silently collapse them into one.`,
      });
    }

    const blank = rowTranslations.filter((translation) => !translation.glossary?.trim()).length;
    if (blank > 0) {
      issues.push({
        code: 'blank-translation',
        severity: 'warning',
        detail: `${blank} translation(s) have no text.`,
      });
    }

    for (const issue of issues) issueCounts[issue.code]++;
    if (issues.length > 0) inspected.push({ row, issues, indexRecords: entryRecords });
  }

  const orphans: OrphanIndexRecord[] = (
    indexReadable ? records.filter((record) => !claimedObjectIds.has(record.objectID)) : []
  ).map((record) => ({
    ...record,
    // Matched on the term the record carries, since its uuid resolves to nothing by definition.
    liveRowWithSameTerm: record.glossary ? (rowByNormalisedTerm.get(normaliseTerm(record.glossary)) ?? null) : null,
  }));
  for (const orphan of orphans) {
    removable[orphan.liveRowWithSameTerm ? 'orphans-live-term' : 'orphans-missing-term'].push(orphan.objectID);
  }

  return {
    stats: {
      entries: rows.length,
      translations,
      indexedEntries,
      indexRecords: records.length,
      orphanIndexRecords: orphans.length,
      redundantIndexRecords,
      orphansWithLiveTerm: orphans.filter((orphan) => orphan.liveRowWithSameTerm).length,
      entriesWithIssues: inspected.length,
      issueCounts,
    },
    entries: inspected.slice(0, MAX_REPORTED_ENTRIES),
    truncatedEntries: inspected.length > MAX_REPORTED_ENTRIES,
    orphanIndexRecords: orphans.slice(0, MAX_REPORTED_ORPHANS),
    truncatedOrphans: orphans.length > MAX_REPORTED_ORPHANS,
    removable,
    indexError,
    indexChecked: indexReadable,
  };
}
