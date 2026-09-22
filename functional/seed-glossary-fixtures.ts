/**
 * Writes the glossary test fixtures to the database and the search index, so the delete buttons
 * and the Glossary Inspector can be exercised by hand against data that says what it is for.
 *
 * The fixtures themselves are defined in glossary-fixtures.ts; this is the part that talks to
 * the database and Algolia.
 *
 * Run with:
 *   pnpm glossary:fixtures -- --yes              # both sets
 *   pnpm glossary:fixtures -- --yes --deletable  # only the ZZTEST-0n set
 *   pnpm glossary:fixtures -- --yes --issues     # only the ZZTEST-1n set
 *   pnpm glossary:fixtures -- --yes --clean      # remove every trace, including leftovers
 *
 * --yes is required because this writes to whatever database and Algolia app .env points at.
 * The target is printed before anything happens; check it is not production.
 *
 * Seeding removes the previous fixtures first, so re-running always gives the same starting
 * state. It does not touch any row or record that is not a fixture.
 */
import 'dotenv/config';
import { ilike, inArray, or } from 'drizzle-orm';

import { glossariesTable, type CreateGlossary } from '~/drizzle/tables';
import { getDb } from '~/lib/db.server';
import algoliaClient from '~/providers/algolia';

import {
  deletableFixtures,
  FIXTURE_PREFIX as PREFIX,
  issueFixtures,
  setFixtureAuthorId,
  type Fixture,
} from './glossary-fixtures';

const INDEX_NAME = 'glossaries';

// ─── Writing and removing ────────────────────────────────────────────────────

// Every objectID the fixtures ever write, so the cleanup is exact without having to browse the
// whole index. Derived from the fixtures themselves, plus the row uuids — a re-index writes a
// record at every row's uuid whether or not the fixture asked for one.
function fixtureObjectIds(fixtures: Fixture[]): string[] {
  const ids = fixtures.flatMap((fixture) => [
    ...fixture.records.map((record) => record.objectID),
    ...(fixture.row?.id ? [fixture.row.id] : []),
    ...(fixture.row?.searchId ? [fixture.row.searchId] : []),
  ]);
  return [...new Set(ids)];
}

async function resolveAuthorId(): Promise<string> {
  if (process.env.TEST_USER_ID) return process.env.TEST_USER_ID;
  const [anyUser] = await getDb().query.usersTable.findMany({ limit: 1 });
  return anyUser?.id ?? 'zztest-fixture';
}

// Removes every fixture row and every fixture index record. `deep` also browses the whole index
// for anything else carrying a ZZTEST term — records the testing itself produced, such as the
// partial record a save writes when search_id points nowhere.
async function clean({ deep }: { deep: boolean }): Promise<{ rows: number; records: number }> {
  const all = [...deletableFixtures(), ...issueFixtures()];
  const rowIds = all.map((fixture) => fixture.row?.id).filter((id): id is string => Boolean(id));

  const deletedRows = await getDb()
    .delete(glossariesTable)
    // By id and by term: a fixture the tester renamed, or one left by an older numbering, still
    // goes. Nothing outside the prefix is matched.
    .where(or(inArray(glossariesTable.id, rowIds), ilike(glossariesTable.glossary, `${PREFIX}%`)))
    .returning({ id: glossariesTable.id });

  const objectIDs = new Set(fixtureObjectIds(all));
  if (deep) {
    await algoliaClient.browseObjects<{ objectID: string; glossary?: string }>({
      indexName: INDEX_NAME,
      browseParams: { query: '', hitsPerPage: 1000, attributesToRetrieve: ['glossary'] },
      aggregator: (response) => {
        for (const hit of response.hits) {
          if (hit.glossary?.toUpperCase().startsWith(PREFIX)) objectIDs.add(hit.objectID);
        }
      },
    });
  }

  // deleteObjects ignores objectIDs that are not there, so the known list can be passed whole.
  await algoliaClient.deleteObjects({ indexName: INDEX_NAME, objectIDs: [...objectIDs], waitForTasks: true });

  return { rows: deletedRows.length, records: objectIDs.size };
}

async function seed(fixtures: Fixture[], authorId: string) {
  const rows = fixtures
    .map((fixture) => fixture.row)
    .filter((fixtureRow): fixtureRow is NonNullable<Fixture['row']> => fixtureRow !== null)
    .map((fixtureRow) => ({ ...fixtureRow, createdBy: authorId, updatedBy: authorId }) as CreateGlossary);

  if (rows.length > 0) {
    await getDb().insert(glossariesTable).values(rows);
  }

  const records = fixtures.flatMap((fixture) => fixture.records);
  if (records.length > 0) {
    // waitForTasks, so the inspector's index check sees them on the very next page load rather
    // than a few seconds later — the gap otherwise reads as a bug in the check.
    await algoliaClient.saveObjects({ indexName: INDEX_NAME, objects: records, waitForTasks: true });
  }
}

// ─── Reporting ───────────────────────────────────────────────────────────────

function describe(heading: string, fixtures: Fixture[]) {
  console.log(`\n── ${heading} ${'─'.repeat(Math.max(0, 74 - heading.length))}`);
  for (const fixture of fixtures) {
    // The term is printed with the invisible characters escaped, so fixture 17 is copyable.
    const term = fixture.term.replace(/\u200b/g, '\\u200b').replace(/ $/, '␣');
    console.log(`\n  ${term}`);
    console.log(`    row      ${fixture.row?.id ?? '(none — this fixture is an index record only)'}`);
    console.log(`    records  ${fixture.records.map((record) => record.objectID).join('\n             ') || '(none)'}`);
    console.log(`    test     ${fixture.tests}`);
    console.log(`    expect   ${fixture.expect}`);
  }
}

function printTarget() {
  const databaseUrl = process.env.DATABASE_URL ?? '';
  const host = databaseUrl.replace(/^.*@/, '').replace(/\?.*$/, '') || '(DATABASE_URL not set)';
  console.log('Target');
  console.log(`  database  ${host}`);
  console.log(`  algolia   app ${process.env.ALGOLIA_APP_ID ?? '(not set)'}, index "${INDEX_NAME}"`);
}

// ─── Entry point ─────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const confirmed = args.includes('--yes') || args.includes('-y');
  const cleanOnly = args.includes('--clean');
  const onlyDeletable = args.includes('--deletable');
  const onlyIssues = args.includes('--issues');

  console.log('=== Glossary fixtures ===\n');
  printTarget();

  if (!confirmed) {
    console.log('\nNothing written. Re-run with --yes once the target above is the one you meant.');
    console.log('  --deletable  only the ZZTEST-0n set (the buttons that remove them)');
    console.log('  --issues     only the ZZTEST-1n set (the checks that report them)');
    console.log('  --clean      remove every fixture, including leftovers from testing');
    return;
  }

  if (cleanOnly) {
    console.log('\nRemoving fixtures (browsing the whole index for leftovers — about a minute)…');
    const { rows, records } = await clean({ deep: true });
    console.log(`Removed ${rows} row(s) and cleared ${records} index objectID(s).`);
    return;
  }

  // Set before the fixtures are built: the translations carry it too.
  const authorId = await resolveAuthorId();
  setFixtureAuthorId(authorId);

  const fixtures = onlyIssues
    ? issueFixtures()
    : onlyDeletable
      ? deletableFixtures()
      : [...deletableFixtures(), ...issueFixtures()];

  console.log('\nRemoving any previous fixtures…');
  const removed = await clean({ deep: false });
  console.log(`Removed ${removed.rows} row(s).`);

  console.log('Writing fixtures…');
  await seed(fixtures, authorId);
  console.log(
    `Wrote ${fixtures.filter((f) => f.row).length} row(s) and ${fixtures.flatMap((f) => f.records).length} index record(s), stamped as ${authorId}.`,
  );

  if (!onlyIssues) describe('Remove these by testing a button', deletableFixtures());
  if (!onlyDeletable) describe('These stay until --clean; the inspector only reports them', issueFixtures());

  console.log(`\n── Where to start ${'─'.repeat(57)}\n`);
  console.log('  1. /data/glossary/inspector → "Check the search index". Every fixture should be');
  console.log('     listed under Entries with issues, and ZZTEST-05 under Orphan index records.');
  console.log('  2. Work through the ZZTEST-0n set above, one button at a time, re-running the');
  console.log('     index check after each. The counts should drop by exactly what you deleted.');
  console.log('  3. Re-index last. It repairs ZZTEST-11, -12 and -13, and turns');
  console.log('     zztest-13-partial-record-no-uuid into an orphan for the cleanup to sweep.');
  console.log(`  4. ${'`pnpm glossary:fixtures -- --yes --clean`'} when you are done.\n`);
  console.log(`  Look anything up in the inspector by "${PREFIX}", or by its number, e.g. "ZZTEST-03".`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n✗ Failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
