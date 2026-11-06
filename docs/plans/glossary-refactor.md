# Glossary refactor: translations out of the JSON blob

Written 2026-11-04, updated 2026-11-06 (PR 7a merged, 7b drops the old columns). **Start with "Where we are" below.**

## Where we are (hand-over, 2026-11-06)

**Released (steps 1–5 done):** PR 1 (#205), PR 2 (#206), PR 3a–c (#207–#209), the glossary
freeze (#210), PR 4 (#211, the switch), then the freeze reverted. 08 was applied on prod
during the freeze; the prod comparison (step 5) passed. The app reads and writes
`glossary_translations` only. PR 6 (#212) and PR 7a (#213) are merged and deployed; PR 7b
(branch `drop-glos-cols`, in the working tree) drops the old columns (see below).

**PR 6 is merged (#212), tested by the user with real data and export/import.** PR 6a (Rationale): Rationale in the create, edit and insert forms and on the translation display
(`GlossaryDetail`, used by the glossary page and the search dialog). One rule for all three
forms, `rationaleSchema` in `glossary.validation.ts`: optional, trimmed (5,000-character cap
removed in PR 7), blank stored as null (so clearing it is not an edit). Also fixed the known
create-form issue: its Chinese-section Sutra Text (`sutraTextChinese`) is now the source
passage and the translation section's (`sutraText`) the target one; the mapping moved into
`app/services/glossary.create.ts` (pure, tested). Checked: tsc, all tests, eslint/prettier on
touched files, 7 mutation checks, and a dev run on ZZTEST (insert, edit, unchanged save,
clear, read back). Not in 6a: the import/replace previews and file columns (6b).

**PR 6b (import/export).** Files gain
two optional columns at the end, `TranslationUUID` and `Rationale` (export, CSV and XLSX
parsing, column docs on both pages, en and zh-Hant). Merge rules (`glossary.merge.ts`, shared
by the importer and the preview through `translationFromRow` in `glossary.parse.ts`):

- a row whose `TranslationUUID` names one of the term's stored translations updates it in
  place (status _Updated_, or _Kept_ if nothing changed): file content and the importer's
  audit, the stored id, language, partOfSpeech/phonetic kept. First row wins if an id repeats;
- **only an id makes an update** (the user's decision, 2026-11-06: content matching is
  brittle): every other row is appended, even one identical to a stored translation. Such a
  row is flagged _Duplicate_ in the preview (exact compare of rendering, source, volume,
  passages and author; blank = null; rationale ignored), as is a row repeating an earlier
  row of the file. So re-importing an export changes nothing, but re-importing an id-less
  file (pre-6b export, hand-made) adds its translations again. An id naming nothing in that
  term is dropped, never reused for a new row (new and revived terms get new ids too).
  `translationKey` stays only for data script 08's duplicate report;
- a missing `Rationale` column leaves stored rationales alone; a blank cell clears it;
- an import removes nothing, and no longer collapses stored exact duplicates (癡).

Replace ignores `TranslationUUID` (all rows are new). The import page's merge explanation was
rewritten (it described an older rule). Checked: tsc, 526 tests, eslint/prettier on touched
files, 20 mutation checks; export → import round trip (CSV and XLSX) changes nothing, an edited
cell comes back as an update; on dev (ZZTEST): untouched CSV/XLSX re-import writes nothing,
an edited row and rationale update in place, an old-format file appends one copy per row and
leaves the originals and their rationales alone.

**PR 7a (#213, merged and deployed 2026-11-06).**

- **Bookmarking removed** (the user's decision: people search terms but don't bookmark; on
  prod `subscribers` was 0 on all 15,027 live terms, and every term dates from July 2026 or
  later). Gone: the bookmark button and its localStorage list on the term card, the
  `bookmark` branch of the glossary page's action, `updateGlossarySubscribers`, the counter
  on the card, the inspector column, and the Settings "Glossary Subscriptions" tab with its
  loader (which had no sign-in check). Settings opens on Font Settings. Browsers keep a stale
  `subscribedGlossaries` localStorage key; it is harmless.
- **Rationale has no length cap** (the user's decision). Create, edit, insert and import all
  accept any length. Known and accepted: **XLSX cells hold at most 32,767 characters** and
  SheetJS throws on a longer one ("Text length must not exceed 32767 characters"), so a
  single longer rationale would make the whole XLSX export fail; CSV is fine. Postgres `text`
  allows up to 1 GB; Rationale is not in the Algolia record or the assistant prompts.
- The JSON and subscriber columns were renamed on the code side (`legacyTranslations`,
  `legacySubscribers`), so no code used them. Three test files that typed rows as
  `ReadGlossary` with `translations` inside now use `InspectedRow` / `ExportableGlossary`.

**PR 7b (branch `drop-glos-cols`, in the working tree): migration B.** First planned as a
"legacy purge" later, then the user decided to drop now: the glossary was changed in place,
the JSON was a stale copy since the switch, and 08's copy had been verified field by field
and by the step 5 export. Unlike the sutra/roll tables, nothing is waiting to be populated.

- **Backup first (done 2026-11-07 00:03 UTC):** a read-only dump of `id, glossary,
deleted_at, subscribers, translations` for all 15,027 prod terms (19,325 JSON translations,
  the same as 08's dry run; `subscribers` 0 everywhere), saved as JSON for the user to keep.
- **Order:** 7a had to be deployed first, because the code live before it still read
  `subscribers`; with 7a live nothing reads either column, so merging 7b (which runs `0026`
  on deploy) is safe.
- `drizzle/migrations/0026_drop-glossary-legacy-columns.sql`, generated by drizzle-kit:
  `ALTER TABLE "glossaries" DROP COLUMN "subscribers"; ALTER TABLE "glossaries" DROP COLUMN
"translations";`. The 0026 snapshot differs from 0025 only by those two columns.
- Removed: both columns from `drizzle/tables/glossary.ts`, `LegacyGlossaryColumn`
  (`GlossaryTerm` is `ReadGlossary` again), data script 08 with its rows module, its test file,
  the round-trip case that used `planTerm`, a store test that guarded against reading the JSON
  column, and `db:migrate:data:08`/`:prod`. Updated `drizzle/schema-proposed-glossary.dbml`.
- Not done: the relation clash is gone, so the store could load translations through it
  (`with: { translations: { orderBy: position } }`) instead of its second query. Optional.
- Checked: tsc, 495 tests, eslint and prettier on the touched files; `pnpm db:generate`
  afterwards reports no further changes. **Not applied to dev**: the dev database still has
  both columns until someone runs `pnpm db:migrate` (needs the user's yes) or a deploy
  pointing at dev does.

Then PR 8 (renames).

The sections below, down to "Known issues", are the PR 3–4 record.

**What PR 3 left in place.** Every read and write of translations goes through one module,
`app/services/glossary.store.ts` (`GlossaryStore`). Nothing else touches the column, except
the seeds and the ZZTEST fixture script, which write the table directly (PR 4 updates
them). The rest of the app sees the shapes in `app/services/glossary.types.ts`
(`GlossaryEntry` = term + `translations: GlossaryTranslation[]`) and keeps the old field
names (`glossary`, `sutraName`, `originSutraText`, … until PR 8). `GlossaryStore.update`
takes the **whole list** a term should end up with; `diffTranslations`
(`app/services/glossary.diff.ts`, pure, tested) turns that into insert/update/remove by id
and is waiting for PR 4.

**PR 4 code: committed on branch `glos-migration` (7ecf32e), plus two fixes in the working
tree (below), tested on dev 2026-11-05.** Dev has 08 applied (17,357 rows). Unit tests (487),
tsc, eslint/prettier on touched files and 21 mutation checks pass. On dev: the export, every
field of every translation and the inspector results are byte-identical between the old code
(JSON) and the new (table); 37 write checks on ZZTEST fixtures pass (edit, no-op, reorder,
remove, insert, stale save rolled back, create, import merge, trash/revive, purge, concurrent
inserts, an edit form open while someone adds, search record = table). Prod dry run of 08:
15,027 terms, 19,325 translations, no issues, no duplicates, no stray `id` fields.

Fixed after the dev tests (working tree):

- An insert-form save sent Drizzle an empty `SET` for the term (it refuses: "No values to
  set"), so Add New Translation always failed. `update` now always sets the term's `updated_at`,
  which also keeps the term moving to the top of the glossary page as before.
- Lost updates: a list built from an earlier read removed translations added since (two
  concurrent inserts kept one; an open edit form deleted a translation added meanwhile). Saves
  now carry a **basis**, the ids the list was built from (`TranslationBasis` in
  `glossary.diff.ts`): the edit form's `baseTranslationIds` (from its default values), the
  stored ids the insert or import read. A stored translation outside the basis is kept, after
  the listed ones. No basis (a page loaded before the deploy): the old meaning. The search
  record is now updated after the save, from the saved entry (a failure is logged; a re-index
  repairs it), so a refused save no longer reaches search.

What it does:

- `glossary.store.ts` reads term columns (never the JSON column) and loads translations from
  `glossary_translations` in a second query, grouped and ordered by `position`. Not Drizzle's
  `with:`: the relation is named `translations`, the same as the JSON column, until PR 7.
  `findAll`/`findAllIncludingTrash` load every row without naming 14k ids.
- `glossary.rows.ts` (new, pure, tested): row ↔ `GlossaryTranslation`, including a round trip
  through 08's `planTerm`. `partOfSpeech`/`phonetic` read as `null`, not absent: the edit form
  posts `''` for an absent field, which the diff would see as an edit of every translation.
- `create`, `update`, `revive` each run in one transaction. `update` updates the term row first
  (which locks it, so concurrent saves of one term serialise), then diffs. A translation that
  only moved keeps its `updated_at`/`updated_by` (set to itself, overriding `$onUpdate`).
- `glossary.diff.ts`: `TranslationListError` (stale or forged ids), `isStored`, `contentChanged`
  on updates, and `addsOrRemoves`, the edit permission rule: adding or removing a
  translation needs Maintain (also closes the "replace one, same length" gap, and an Update
  user can no longer add via the edit form). A stale list returns 409, not 500.
- Edit form: no hidden input. The translation `id` travels in the form's default values and
  `glossaryEditFormSchema` keeps it (`uuid().optional()`); a registered input with no value
  would post `''`.
- Seeds and ZZTEST fixtures write `glossary_translations` (fixtures in one transaction);
  cleanup relies on the cascade. Inspector label now "translations (glossary_translations)".
- The JSON column is no longer written: new terms get `[]` there.

Not done in PR 4 (noted): an import touching a term with an exact duplicate (癡) drops the
duplicate, as the JSON code did (`mergeTranslations`).

The freeze (#210) was a `GLOSSARY_FROZEN` switch in `app/authorisation/ability.ts` (non-admins
lost every glossary level) plus a server-side Maintain check on the create action, which
stays. Reverted after step 5.

**PR 4 steps** (all done):

1. **Prod dry run of 08** (read-only, but needs the user's yes:
   `pnpm db:migrate:data:08:prod`). Look for blocking issues, in particular `unknown-field`
   for `id`: until 3c, the glossary page's insert form saved the term's uuid in the new
   translation as `id`. Dev has none. If prod has some, decide with the user: drop `id` in
   08's mapping (it is the term's own id, so nothing is lost) or clean the JSON first.
2. **Dev `--apply` of 08** (needs the user's yes) when PR 4 is ready to test, then a dev
   export before and after the switch must match row for row.
3. **Code for PR 4:**
   - `GlossaryStore` reads load translations from the table, ordered by `position`
     (Drizzle `with: { translations: { orderBy: position } }`, relations exist), and map
     rows to `GlossaryTranslation`: `term`→`glossary`, `sourceName`→`sutraName`,
     `sourceText`→`originSutraText`, `targetText`→`targetSutraText`, `metadata`
     → `partOfSpeech`/`phonetic`, `updatedAt` timestamp → ISO string, `rationale`, `id`.
     Keep a pure mapper with tests; 08's `planTerm` is the mapping in the other direction.
   - `findForInspection`'s `translations::text ILIKE` becomes a search on the table;
     `findIndexPage` loads translations for the page.
   - `create`, `update`, `revive` in one transaction each (`db.transaction`, supported: the
     app uses the Neon `Pool` driver). `update` reads the stored rows and applies
     `diffTranslations`; `revive` replaces all rows.
   - Edit form: a hidden translation `id` per row (`app/components/GlossaryList.tsx`), and
     `id` kept by `glossaryEditFormSchema`. Without it every save deletes and re-creates
     all of a term's translations, so they get new ids each time.
   - "Removing translations needs Maintain" (`app/routes/_app.glossary._index.tsx`)
     becomes "the diff removes something", which also closes today's gap: replacing one
     translation with another without shortening the list.
   - Seeds (`drizzle/seeds/dev/6-glossaries-seed.ts`) and fixtures
     (`functional/glossary-fixtures.ts`, `seed-glossary-fixtures.ts`) write the table.
   - Stop writing the JSON column; keep it (fallback) until PR 7.
4. **Release** (each prod step needs the user's yes): prod export → freeze glossary editing →
   `08 --apply` on prod → merge and deploy at once → unfreeze when live. Then step 5.

**Known issues found on the way, not fixed (deliberately):**

- Fixed in the cleanup after 7b: `glossaryEditFormSchema` no longer has an `updatedAt` default
  computed at module load (the edit action stamps the time; the store never wrote the posted
  value anyway). The glossary page's action no longer answers success to a POST it doesn't
  handle (the old create branch, dead since creating moved to `_app.glossary.tsx`): 400.

- A copy of the rejected earlier schema draft is in the 2026-11-05 session's scratchpad
  only; ask the user before relying on it.

**How each PR so far was checked** (keep doing this): `npx tsc --noEmit -p .`,
`npx vitest run`, eslint and prettier **on the touched files only** (running prettier over
`app/` reformats ~40 unrelated files), mutation checks (break each rule, confirm a test
fails), then on dev:

- **Read-only comparisons:** a temporary script in the repo root, `.tmp-*.ts` (top-level
  await works there, and packages resolve), run with
  `npx dotenv -e .env -- npx tsx ./.tmp-x.ts`, deleted afterwards.
- **Old code against new:** `git archive HEAD | tar -x -C <scratch>/base`, symlink
  `node_modules` into it, copy the same script into both trees and run it in each; diff
  the JSON outputs.
- **Writes, on fixtures only** (with the user's yes): seed with
  `pnpm glossary:fixtures -- --yes --deletable`, and remove every trace with
  `pnpm glossary:fixtures -- --yes --clean` (rows and index records, including other
  `ZZTEST%` terms a test created). Use fixed uuids
  (`0000fe57-0000-4000-8000-0000000000nn`) for anything a test creates, so runs compare.

## Goal

Today each Chinese term is one row in `glossaries`, and all its translations live in one
`translations json` column. Split the translations into their own table, one row per
translation, so that:

- a translation can be edited or deleted on its own, without rewriting the whole array
  (today two people editing different translations of one term overwrite each other);
- each translation has a stable id, so a corrected translation can be re-imported as an
  update instead of arriving as a duplicate (the limitation documented in
  `app/services/glossary.merge.ts`);
- each translation can carry a **rationale**: why that rendering was chosen, to keep the
  arguments behind translation decisions.

## Decisions already made (with the user)

1. **The glossary stays independent of the translation tables.** No links to works,
   documents, sections or `paragraphs_new`. Citations (sutra name, volume, passages) stay
   free text. A link may be wanted later; don't design it in now.
2. **Add a rationale per translation** (free text, optional).
3. **Two tables:** `glossaries` (the terms, as today without the JSON) plus
   `glossary_translations` (one row per current JSON element). A three-level
   term → rendering → attestation design was considered and rejected: on dev data 16,918 of
   17,357 translations are distinct (term, rendering) pairs, so the middle level would add
   joins for almost no gain.
4. **Keep the schema small.** Rare fields go in a `metadata json` column instead of their
   own columns. The speculative columns of an earlier draft (sense, term_type,
   attestation_type, passage_ref, cbeta_ref, work/document/section/paragraph FKs, …) are
   **out**. Since 2026-11-05, `drizzle/schema-proposed-glossary.dbml` describes the schema
   actually being built (it replaced that draft), and `glossary-current.dbml` the schema
   before the refactor.

## Working rules for whoever picks this up

- **No database change without the user's explicit approval**, including on the dev DB
  (`.env` points at a shared cloud dev database). Propose the exact table and migration
  first, then wait.
- The user does all git work (branches, commits). Leave changes in the working tree.
- Don't extend legacy roll/sutra code. The goal is to retire the legacy tables.
- Testing standard used so far: pure logic in DB-free modules with unit tests, services and
  routes tested with mocked DB/Algolia, then **mutation checks** (break each rule, confirm a
  test fails), then a read-only run of the real app. Read-only queries against dev are fine.

## Current shape (what exists today)

`drizzle/tables/glossary.ts`, table `glossaries`:

| column                                                | notes                                                                                                       |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `id` uuid                                             | also the Algolia objectID (`glossary.record.ts`) and the key of localStorage bookmarks; **must not change** |
| `glossary` text, unique                               | the Chinese term (`unique_glossary_idx`)                                                                    |
| `phonetic`, `cbeta_frequency`, `author`, `discussion` | term-level                                                                                                  |
| `subscribers` int                                     | unused: subscriptions live in localStorage                                                                  |
| `translations` json                                   | the array being split out                                                                                   |
| `search_id`, audit fields, `deleted_at`               | soft delete = the glossary "trash"                                                                          |

Each JSON element: `glossary` (the rendering, confusingly named), `language`, `sutraName`,
`volume`, `originSutraText`, `targetSutraText`, `author`, `partOfSpeech`, `phonetic`,
`updatedBy`, `updatedAt`.

### Data facts (dev DB, 2026-11-04; **profile prod before migrating**)

- 13,920 live terms, 0 trashed; 17,357 translations. Per term: 1 has 0, 11,944 have 1,
  1,865 have 2–5, 110 have more (max 27).
- Every translation is `english`. `author`, both passages, `updatedAt` and `updatedBy` are
  filled on every row. `partOfSpeech` and per-translation `phonetic` are filled on **none**.
  Term `discussion` is empty everywhere; `subscribers` is 0 everywhere.
- Sources: 佛說佛名經 10,171 · 華嚴經 5,522 · 楞嚴經 1,146 · 彌陀要解 428 · 佛教常用術語 45 ·
  地藏經 42 · others 3. `volume` is the scroll (卷) number, not a section.
- **Duplicates:** under the import's identity key (`translationKey()` in
  `glossary.merge.ts`: rendering, source, volume, both passages, author) there is
  **1 exact duplicate** already. Under the old draft's unique index
  (term, rendering, source, volume) **3 rows collide**, so that index would reject real
  data. Decision below: no unique constraint.
- **Term author vs translation author:** they differ on 975 of 17,357 rows. The import
  sets the term's `author` from the _first row_ of the file
  (`importGlossaries` in `glossary.service.ts`), so the term-level value is fairly
  arbitrary. Values are roles, not people: 翻譯團隊, 詞彙義工, 法師. See open question 1.

Profile prod with the same queries (read-only):

```sql
select count(*), sum(json_array_length(translations)) from glossaries where deleted_at is null;
select t->>'language', count(*) from glossaries g, json_array_elements(g.translations) t group by 1;
select count(*) rows,
       count(distinct (g.id, lower(btrim(t->>'glossary')), t->>'sutraName', t->>'volume',
             md5(coalesce(t->>'originSutraText','')), md5(coalesce(t->>'targetSutraText','')),
             lower(btrim(coalesce(t->>'author',''))))) distinct_full_key
from glossaries g, json_array_elements(g.translations) t;
```

## Proposed schema (needs the user's approval before anything is generated)

`glossaries` stays as it is. Its `translations` column is dropped only at the very end
(step 5).

New table `glossary_translations` (Drizzle sketch, `drizzle/tables/glossary.ts`):

```ts
export const glossaryTranslationsTable = pgTable(
  'glossary_translations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    glossaryId: uuid('glossary_id')
      .references(() => glossariesTable.id, { onDelete: 'cascade' })
      .notNull(),
    // Display order within the term; the JSON array's order is meaningful today
    // (merge keeps stored order and appends new ones).
    position: integer('position').notNull(),
    language: langEnum('language').notNull().default('english'),
    term: text('term').notNull(), // the rendering (JSON `glossary`)
    sourceName: text('source_name').notNull().default('佛教常用詞'), // JSON `sutraName`; sentinel = no source
    volume: text('volume').notNull().default('-'),
    sourceText: text('source_text'), // JSON `originSutraText`
    targetText: text('target_text'), // JSON `targetSutraText`
    author: text('author'),
    rationale: text('rationale'), // NEW: why this rendering was chosen
    // Rare fields: partOfSpeech, phonetic (0 rows use them today).
    metadata: json('metadata').$type<Record<string, string>>(),
    ...auditAtFields,
    ...auditByFields,
  },
  (t) => [index('glossary_translations_glossary_id_idx').on(t.glossaryId)],
);
```

Notes:

- **No unique constraint.** Identity stays in code (`translationKey()`), because the data
  already holds legitimate near-duplicates and one exact duplicate.
- `onDelete: 'cascade'` so purging a term from the trash removes its translations. Trashing
  is a soft delete on the term, so translations need no `deleted_at` of their own (the
  column comes with `auditAtFields` and stays unused for now).
- `language` reuses the existing `lang` enum. The forms already restrict translations to
  every language except Chinese (`GLOSSARY_TRANSLATION_LANGUAGES` in `app/utils/lang.ts`).
- Audit: `created_at`/`updated_at` and `created_by`/`updated_by` are both filled from the
  JSON's `updatedAt`/`updatedBy` on migration.

## Steps: stepwise merges into main

**Schema migrations run automatically on deploy:** `vercel.json` builds with
`pnpm build && pnpm db:migrate`, so merging to main applies pending `drizzle/migrations/*.sql`
to prod (and a preview deploy applies them to whatever database its env points at).
**Data scripts (`db:migrate:data:*`) never run automatically**: someone runs them by hand.
Every manual apply (dev or prod) needs the user's yes.

1. **PR 1: schema, migration A (additive).** New table and relations, `0025`. Nothing reads
   it, so it is safe for the merge to apply it on prod.
2. **PR 2: data script** `drizzle/migrations/data/08-glossary-translations.ts`, plus
   `db:migrate:data:08` and `:prod` scripts, following the `01`/`02`/`07` pattern:
   - unnest each live _and_ trashed term's JSON into rows (`position` = array index), as a
     pure function with unit tests;
   - copy faithfully, the exact duplicate included, and **report** duplicates;
   - dry run by default, `--apply` to write; refuse if the table already has rows;
   - verify: Postgres's own element count, then every row read back and compared field by
     field, inside the transaction (a mismatch rolls back);
   - `created_at`/`updated_at` and `created_by`/`updated_by` from the JSON's
     `updatedAt`/`updatedBy`; `partOfSpeech`/`phonetic` into `metadata` only if non-empty.
   - After merge: dry run on dev and prod (read-only). A dev `--apply` goes stale as the JSON
     keeps being edited, so apply on dev right before PR 4 (or add a dev-only `--replace`).
3. **PR 3: refactor, no behaviour change, still on JSON**, as three merges. The frontend
   keeps today's shape (plus optional `id`, `rationale`); only PR 6 and PR 8 change it.
   - **3a: types and dead code.** `app/services/glossary.types.ts`: `GlossaryTranslation`
     (spelled out, not derived from the JSON column), `GlossaryTerm`, `GlossaryEntry`,
     `WithTranslations<T>`. Pure modules (record, export, analyse) and test fixtures use
     them. Removed unused `upsertManyById`, `upsertManyByTerm`, `readSutraNames`.
     (`deleteGlossariesByUserId` stays: the e2e teardown uses it.)
   - **3b: reads.** `glossary.store.ts` owns every read (crud `find*`, glossary page, trash,
     re-index pages, inspector reads and its JSON text search) and returns `GlossaryEntry`.
   - **3c: writes.** The store owns every write of translations: `create`, `update` and
     `revive` take the term's columns and the translations apart; `updateTerm` writes term
     columns only. `update` takes the **whole list** the term should end up with (edit sends
     the form's list, insert the stored list plus the new one, import the merge), so there is
     no separate append: in PR 4 the store diffs that list against the stored rows by id
     (`diffTranslations` in `glossary.diff.ts`, pure, tested, not wired until PR 4). The diff
     compares content only, so an edit no longer re-stamps translations it didn't change.
     Import matching by id moved to 6b, where the file first carries `TranslationUUID`.
     Also fixed: the insert form put the term's uuid into the new translation as `id`. Dev
     has none; **prod may** — 08 treats `id` as an unknown field and refuses, so check the
     prod dry run before PR 4 and decide then (drop it in 08, or clean it first).
   - Test on dev per merge: glossary export and inspector counts identical before and
     after; read-only pass of the app; for 3c, writes on ZZTEST fixtures only (with approval).
4. **PR 4: the switch.** The module reads and writes the table; multi-row writes in
   transactions; edits diff by id; deletes check Maintain. Seeds and fixtures. Release:
   prod export → `08 --apply` on prod → merge/deploy immediately, while nobody edits. The old
   code keeps writing the JSON until the new build is live (a few minutes), so edits in that
   window would be lost: freeze glossary editing from the copy until the deploy is live.
5. **Verify on prod (no PR):** export again, must match the pre-switch export row for row;
   read-only pass of the app.
6. **PR 6: features.** 6a Rationale in the create/edit/insert forms and display, with
   validation. 6b import/export `TranslationUUID` and `Rationale` columns, id-matched
   re-import, previews; export must round-trip through import.
7. **PR 7: migration B.** 7a (#213): bookmarking and the Rationale cap removed, columns
   renamed in code. 7b: migration `0026` drops `glossaries.translations` and
   `glossaries.subscribers` after a prod dump (see "Where we are").
8. **PR 8 (later): rename** read-shape fields to the table's names (`glossary` → `term`,
   `sutraName` → `sourceName`, `originSutraText` → `sourceText`,
   `targetSutraText` → `targetText`). File columns and the Algolia record keep their names.

## Code map: everything that reads or writes `translations`

Recommended approach to keep the change reviewable: the read layer returns terms with a
`translations` array **in a shape close to today's** (plus `id` and `rationale`), loaded
with Drizzle's `with: { translations: { orderBy: position } }`. Most UI then changes very
little. Renaming fields in the UI (`glossary` → `term`, …) can be a later step. Confirm with
the user (open question 5).

| File                                                                                                                                            | What changes                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `drizzle/tables/glossary.ts`, `drizzle/relations.ts`                                                                                            | new table and relations; later drop the JSON column                                                                                                                                                                                                                                                                                                                              |
| `app/services/glossary.crud.ts`                                                                                                                 | reads load translations; add translation CRUD (insert, update by id, delete by id, replace-all for revive)                                                                                                                                                                                                                                                                       |
| `app/services/glossary.service.ts`                                                                                                              | `updateGlossaryTranslations` becomes a diff by id (update, insert, delete) in one transaction; `importGlossaries`, `createGlossaryAndIndexInAlgolia`, `reviveTrashedGlossary`, `purgeTrashedGlossaries`, `deleteAllGlossaries` (translations first, or rely on the cascade), `readSutraNames` (becomes `select distinct source_name`), `searchGlossaries`, `reindexGlossaryPage` |
| `app/services/glossary.merge.ts`                                                                                                                | keep `translationKey()`; matching by id first when the file carries one                                                                                                                                                                                                                                                                                                          |
| `app/services/glossary.parse.ts`, `glossary.export.ts`, `components/data/GlossaryFileColumns.tsx`                                               | new optional columns `TranslationUUID` and `Rationale`; export must still round-trip through import                                                                                                                                                                                                                                                                              |
| `app/services/glossary.record.ts`                                                                                                               | **keep the Algolia record shape** (term + `translations[{glossary, language}]`), built from the rows. Then no re-index is needed                                                                                                                                                                                                                                                 |
| `app/services/glossary.analyse.ts`, `glossary.inspect.ts`, `routes/_app.data.glossary.inspector*.ts(x)`                                         | read translations from the new shape                                                                                                                                                                                                                                                                                                                                             |
| `app/routes/_app.glossary._index.tsx` (edit / insert / delete actions)                                                                          | edit sends ids; "removing translations needs Maintain" becomes a check on deletes                                                                                                                                                                                                                                                                                                |
| `app/routes/_app.glossary.tsx` (create entry)                                                                                                   | term and first translation in one transaction; add a Rationale field                                                                                                                                                                                                                                                                                                             |
| `app/components/GlossaryList.tsx`                                                                                                               | hidden translation id in the edit form; Rationale field (edit, insert, display)                                                                                                                                                                                                                                                                                                  |
| `app/validations/glossary.validation.ts`                                                                                                        | `id` (optional, for new rows) and `rationale` on translation schemas                                                                                                                                                                                                                                                                                                             |
| `app/routes/_app.data.glossary.import.tsx`, `_app.data.glossary.replace.tsx`                                                                    | previews show the new columns                                                                                                                                                                                                                                                                                                                                                    |
| `app/services/edge.only.ts`, `routes/openai.ts`, `routes/_app.assistant._index.tsx`                                                             | consumers of `searchGlossaries`; check the shape still fits                                                                                                                                                                                                                                                                                                                      |
| `app/routes/_app.settings._index.tsx`, `components/SideBarMenu.tsx`, `services/search.server.ts`                                                | read `ReadGlossary`; follow the new read type                                                                                                                                                                                                                                                                                                                                    |
| `drizzle/seeds/dev/index.ts`, `functional/glossary-fixtures.ts`, `functional/seed-glossary-fixtures.ts`                                         | seed and fixtures write translations                                                                                                                                                                                                                                                                                                                                             |
| tests: `glossary.analyse`, `glossary.export`, `glossary.fixtures`, `glossary.merge`, `glossary.parse`, `glossary.record`, `glossary.validation` | update fixtures; add tests for the diff-by-id update, id-matched import and the data migration's unnesting (as a pure function)                                                                                                                                                                                                                                                  |

## Test plan

- **Pure functions:** JSON element → row (data migration); diff of the edit form against
  stored rows (which to update, insert, delete); import matching (id first, then
  `translationKey()`).
- **Services with mocked DB:** transactions wrap the multi-row writes; a failed write leaves
  nothing half-done.
- **Mutation checks** on: id matching, the delete permission, position ordering, and the
  duplicate reporting.
- **Dev:** dry run of the data script (counts must match the facts above), apply only with
  approval, then compare exports before and after (step 4).
- **App, read-only:** glossary page, search dialog, inspector, export.

## Decisions on the former open questions (2026-11-05)

1. **Term-level `author`:** keep it as is for now (shown on the term card, editable).
   Revisit later.
2. **Rationale per translation only.** Leave the empty term `discussion` alone.
3. **Per-translation `partOfSpeech` / `phonetic`:** keep, in the `metadata` json column
   (no data today). The Chinese pinyin is the term-level `glossaries.phonetic`, unchanged.
4. **`subscribers`:** dropped in PR 7b, together with bookmarking (removed in 7a).
5. **Field names:** keep today's names in the read shape for PRs 3–4; rename in PR 8.
   Naming rule for new code: **source / target** (as in `projects.source_document_id`).
   `origin` is legacy; avoid `translation` as the counterpart of `source`, since it already
   means a glossary row, a project and the activity.

## Related state at hand-over (not part of this refactor)

- Paragraph search and the Paragraphs data page run on `paragraphs_new`. The Algolia
  paragraph index has been rebuilt; run `pnpm search:rebuild --apply` (and `:prod`) once to
  apply the index settings (search only the text, typo fallback, phrase search).
- Paragraph history and comments: deferred. Nobody uses them yet.
- `users.origin_lang` / `target_lang` were dropped (#204). No native-language field is wanted.
