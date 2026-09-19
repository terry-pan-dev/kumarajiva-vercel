// Checks that the manual fixtures in functional/glossary-fixtures.ts still produce what
// their names promise.
//
// The fixtures are how the inspector gets tested by hand, and a fixture that has quietly
// stopped tripping its check is worse than no fixture: the page looks clean and the tester
// concludes the button works. So the whole set is run through the real analyseGlossary here —
// no database, no Algolia, just the rows and index records the seed script would write.
//
// It is also the cheap way to keep the two sets honest about each other. A fixture built to
// demonstrate one issue must not land in a cleanup class by accident, or testing the sweep
// buttons would delete the things the issue checks are meant to be reporting.
import { describe, expect, it } from 'vitest';

import { type ReadGlossary } from '~/drizzle/tables';
import { analyseGlossary, type GlossaryIssueCode, type IndexRecord } from '~/services/glossary.analyse';

import { deletableFixtures, issueFixtures, type Fixture } from '../functional/glossary-fixtures';

// The seed script leaves the audit columns to the database; the analyser wants whole rows.
function asRows(fixtures: Fixture[]): ReadGlossary[] {
  return fixtures
    .map((fixture) => fixture.row)
    .filter((row): row is NonNullable<Fixture['row']> => row !== null)
    .map(
      (row) =>
        ({
          discussion: null,
          deletedAt: null,
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
          createdBy: 'user-1',
          updatedBy: 'user-1',
          ...row,
        }) as ReadGlossary,
    );
}

function asRecords(fixtures: Fixture[]): IndexRecord[] {
  return fixtures.flatMap((fixture) => fixture.records) as IndexRecord[];
}

// Both sets are always seeded together by default, so they are analysed together too: that is
// the state the tester actually sees.
const ALL = [...deletableFixtures(), ...issueFixtures()];
const inspection = analyseGlossary({ rows: asRows(ALL), indexRecords: asRecords(ALL) });

function issuesFor(term: string): GlossaryIssueCode[] {
  const entry = inspection.entries.find((candidate) => candidate.row.glossary === term);
  return entry ? entry.issues.map((issue) => issue.code) : [];
}

describe('the fixtures you remove by testing a button', () => {
  it('leaves ZZTEST-01 and ZZTEST-02 clean, so a failed delete is the only reason they linger', () => {
    expect(issuesFor('ZZTEST-01-DELETE-WHOLE-ENTRY')).toEqual([]);
    expect(issuesFor('ZZTEST-02-DELETE-ONE-TRANSLATION')).toEqual([]);
  });

  it('gives ZZTEST-03 two duplicate records and puts exactly those in the duplicates class', () => {
    expect(issuesFor('ZZTEST-03-DELETE-DUPLICATE-SEARCH-RECORDS')).toContain('duplicate-index-record');
    expect(inspection.removable.duplicates.sort()).toEqual([
      'zztest-03-duplicate-record-a',
      'zztest-03-duplicate-record-b',
    ]);
    expect(inspection.stats.redundantIndexRecords).toBe(2);
  });

  it('classes ZZTEST-04 as an orphan whose term is still in the glossary', () => {
    expect(inspection.removable['orphans-live-term']).toEqual(['zztest-04-orphan-record-live-term']);
    const orphan = inspection.orphanIndexRecords.find(
      (record) => record.objectID === 'zztest-04-orphan-record-live-term',
    );
    expect(orphan?.liveRowWithSameTerm?.glossary).toBe('ZZTEST-04-DELETE-ORPHAN-TERM-STILL-LIVE');
  });

  it('classes ZZTEST-05 as an orphan whose term is gone, and gives it no row', () => {
    expect(inspection.removable['orphans-missing-term']).toEqual(['zztest-05-orphan-record-term-gone']);
    const orphan = inspection.orphanIndexRecords.find(
      (record) => record.objectID === 'zztest-05-orphan-record-term-gone',
    );
    expect(orphan?.liveRowWithSameTerm).toBeNull();
    expect(inspection.entries.some((entry) => entry.row.glossary === 'ZZTEST-05-DELETE-ORPHAN-TERM-GONE')).toBe(false);
  });
});

describe('the fixtures for issues the inspector only reports', () => {
  // Each entry names the issue code it must raise — the same string the badge on the page
  // shows, and the same string in the term.
  const expected: [string, GlossaryIssueCode][] = [
    ['ZZTEST-11-ISSUE-not-indexed', 'not-indexed'],
    ['ZZTEST-12-ISSUE-stale-index-pointer', 'stale-index-pointer'],
    ['ZZTEST-13-ISSUE-search-id-mismatch', 'search-id-mismatch'],
    ['ZZTEST-14-ISSUE-soft-deleted', 'soft-deleted'],
    ['ZZTEST-15-ISSUE-NEAR-DUPLICATE-TERM', 'near-duplicate-term'],
    ['zztest-15-issue-near-duplicate-term', 'near-duplicate-term'],
    ['ZZTEST-17-ISSUE-term-has-invisible-characters​ ', 'term-has-invisible-characters'],
    ['ZZTEST-18-ISSUE-no-translations', 'no-translations'],
    ['ZZTEST-19-ISSUE-blank-translation', 'blank-translation'],
  ];

  it.each(expected)('%s raises %s', (term, code) => {
    expect(issuesFor(term)).toContain(code);
  });

  it('does not let any of them fall into a cleanup class, so the sweep buttons leave them alone', () => {
    const removable = [
      ...inspection.removable.duplicates,
      ...inspection.removable['orphans-live-term'],
      ...inspection.removable['orphans-missing-term'],
    ];
    const issueObjectIds = issueFixtures().flatMap((fixture) => fixture.records.map((record) => record.objectID));
    expect(removable.filter((objectID) => issueObjectIds.includes(objectID))).toEqual([]);
  });

  it('keeps ZZTEST-13 out of the orphan list: its search_id claims the record with no uuid', () => {
    expect(inspection.orphanIndexRecords.map((record) => record.objectID)).not.toContain(
      'zztest-13-partial-record-no-uuid',
    );
  });
});
