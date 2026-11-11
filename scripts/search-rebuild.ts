// Rebuilds the paragraph search index (Algolia `paragraphs`) from paragraphs_new.
//
//   pnpm search:rebuild               dry run against .env: reports what a rebuild would do
//   pnpm search:rebuild --apply       rebuilds the .env index
//   pnpm search:rebuild:prod [--apply]   the same against .env.prod
//
// It also applies the index settings in app/services/paragraph.record.ts (searchable fields,
// typo tolerance, phrase search), so a settings change is rolled out by running it.
//
// Not a routine job: everyday edits, imports and deletes keep the index in step. Run it when
// the index has drifted from the database — after bulk changes made outside the app (seeding,
// hand-written SQL, restoring a backup), after a failed search sync, or after the record shape
// in app/services/paragraph.record.ts changes. The swap is atomic, but a paragraph saved while
// it runs can miss the new index, so run it when nobody is editing.
import { rebuildParagraphIndex } from '~/services/search.server';

const apply = process.argv.includes('--apply');

const SAMPLE = 10;
const sample = (ids: string[]) => ids.slice(0, SAMPLE).join(', ') + (ids.length > SAMPLE ? ', …' : '');

async function main() {
  console.log(apply ? 'Rebuilding the paragraph search index…' : 'Dry run — nothing will be written.');

  const result = await rebuildParagraphIndex({ apply });

  console.log(`paragraphs_new rows:          ${result.rows}`);
  console.log(`index records before:         ${result.recordsBefore}`);
  console.log(`index records ${apply ? 'now:   ' : 'after: '}         ${result.records}`);
  console.log(
    `index settings ${apply ? 'changed:  ' : 'to change:'}    ` +
      (result.settingsChanged.length ? result.settingsChanged.join(', ') : 'none (already as configured)'),
  );

  if (result.withoutSearchId.length > 0) {
    console.warn(
      `\n${result.withoutSearchId.length} row(s) have no search_id and are not searchable: ${sample(result.withoutSearchId)}`,
    );
  }
  if (result.duplicateSearchId.length > 0) {
    console.warn(
      `\n${result.duplicateSearchId.length} row(s) share a search_id with another row; only the first is indexed: ` +
        sample(result.duplicateSearchId.map((d) => `${d.id} (${d.searchId})`)),
    );
  }

  if (result.tooBig.length > 0) {
    console.warn(
      `\n${result.tooBig.length} row(s) are over the ${result.maxBytes}-byte record limit and are not indexed: ` +
        sample(result.tooBig.map((r) => `${r.passageKey ?? r.id} (${r.bytes} bytes)`)),
    );
  }

  if (!apply) console.log('\nRun again with --apply to rebuild.');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Rebuild failed:', error);
    process.exit(1);
  });
