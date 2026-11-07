# Glossary refactor: translations out of the JSON blob

Written 2026-11-04, updated 2026-11-06 (PR 7 merged; PR 8a renames the source fields, 8b the rendering). **Start with "Where we are" below.**

## Where we are (hand-over, 2026-11-06)

**Released (steps 1–5 done):** PR 1 (#205), PR 2 (#206), PR 3a–c (#207–#209), the glossary
freeze (#210), PR 4 (#211, the switch), then the freeze reverted. 08 was applied on prod
during the freeze; the prod comparison (step 5) passed. The app reads and writes
`glossary_translations` only. PR 6 (#212), PR 7a (#213), PR 7b (#214, drops the old
columns), the cleanup (#215), PR 8a + 8b (#216), PR 9 (#217) and PR 11 (#218) are merged.
**Column move** (the headword's column `glossary` → `source_term`, three deploys): deploy A is
committed on branch `switch-term` (2b9fdfc04, PR open, not merged); deploy B is in the working
tree on top of it. Neither is applied on dev or prod. The user merges A and B close together
to keep the time between them short, but **A must be live on prod before B is merged** (see
"Column move"). PR 10 waits (the user wants to think it over).

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

**PR 7b (#214, merged): migration B.** First planned as a
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
  afterwards reports no further changes. Dev and prod are migrated.

**PR 8a (committed on `rename-labels`, e01324617): source fields renamed** in the read shape and the
edit and insert forms: `sutraName` → `sourceName`, `originSutraText` → `sourceText`,
`targetSutraText` → `targetText` (the table's names). 8b (`glossary` → `term` for the
rendering) is separate, because `glossary` also means the term, the page and the feature.

- **Renamed by symbol, not by text:** a throwaway script ran the TypeScript language service's
  rename on the properties of `GlossaryTranslation`, `MergeableTranslation`, the edit and
  insert schemas and the import preview's `ExistingGlossary`. tsc then pointed at the rest:
  the key lists in `glossary.diff.ts` / `glossary.merge.ts`, `translationFromRow`, the
  replace preview and the dev seed. String form names in `GlossaryList.tsx` were renamed by
  hand and checked against the schema keys by script.
- **Kept, on purpose:** the paragraph import / legacy `references` `sutraName` (not
  glossary); the create form's own fields (`sutraName`, `sutraText`, `sutraTextChinese` in
  `glossaryFormSchema`); the parsed file row `GlossaryImportRow` and the file columns
  (`SutraName`, `ChineseSutraText`, …) with their i18n keys; the Algolia record; and the
  assistant's `sutraTexts[].sutraName` from `searchGlossaries`, which is sent to the model.
- **Deploy window:** a page loaded before the deploy posts the old names. `sourceName` is
  required in both the edit and insert schemas, so such a post is refused (an error, reload
  and redo), never saved without its fields. A test pins this.
- **Also fixed (found by the dev run, older than 8a):** creating a term that is in the trash
  (the create form's revive path) failed with a foreign-key error since PR 4: the create
  form's term carries a new uuid, and `GlossaryStore.revive` wrote it into the trashed row.
  `revive` now never writes `id`; store test added. The import's revive path was unaffected.
- **Checked:** tsc, 498 tests (the paragraph import tests unchanged and passing), eslint and
  prettier on the touched files, 7 mutation checks. On dev, old tree against new:
  byte-identical read shape (13,926 terms, 17,366 translations, every field, new names mapped
  back), CSV, XLSX rows, search records, inspector and the assistant's lookups (47 terms
  through Algolia). Writes on ZZTEST (edit, unchanged save, insert with defaults and in full,
  create, trash and revive, import by TranslationUUID plus a new entry, export → re-import):
  the stored rows are identical between the trees. The re-import changes no translation; it
  only bumps each term's `updated_at` (the store stamps every term update, in both trees).
- **Checked in a browser by the user:** editing an entry and adding a translation with Insert.

**PR 8b (in the working tree on `rename-labels`): the rendering renamed** `glossary` → `term`
in the read shape (`GlossaryTranslation`, `MergeableTranslation`), the edit form's
`translations[]`, the insert form and the import preview's `ExistingGlossary`. That completes
step 8: the translation fields now carry the table's names.

- **Renamed by symbol, as in 8a:** the TypeScript language service's rename on those five
  declarations (86 locations); tsc then pointed at the key lists in `glossary.diff.ts` /
  `glossary.merge.ts`, `translationFromRow`, the import preview's mapping, the replace
  preview, the dev seed and the test helpers. Form names in `GlossaryList.tsx`
  (`translations.${index}.term`, insert `term`) by hand, checked against the schema keys.
- **Kept, on purpose:** the term's own `glossary` (the headword: `glossaries.glossary`, the
  edit form's top-level `glossary`, `GlossaryTerm`); the create form's fields
  (`glossaryFormSchema.glossary`, mapped to `term` in `glossary.create.ts`); the file column
  `EnglishTerm` and `GlossaryImportRow.englishTerm`; the Algolia record and the edit's
  partial update (`translations[{glossary, language}]`, so no re-index); the assistant's
  `definitions` from `searchGlossaries`.
- **Deploy window:** a page loaded before the deploy posts the rendering as `glossary`. `term`
  is required in the edit form's translations and in the insert form, so such a post is
  refused, never saved without its rendering. Tests pin this (edit and insert).
- **Checked:** tsc, 500 tests, eslint and prettier on the touched files, 13 mutation checks (12
  killed). The survivor: dropping `term` from `translationKey` fails no test. Older than 8b, and
  `translationKey` has had no caller outside its tests since data script 08 was removed in 7b
  (the `glossary_translations` table comment still names it as the identity). Candidate for
  removal.
- **Not checked:** no dev run (old tree against new) as 8a had; the change is a field rename
  only, and the read and write mappings (`glossary.rows.ts`) are unit-tested and mutation-
  checked. Worth one browser pass like 8a's: open Edit on an entry, change a translation's
  term and save; add a translation with Insert; the import preview shows the translations.

**Next (agreed with the user 2026-11-06):** `rename-labels` (8a + 8b) is merged as #216. Then one
PR each, in this order:

- **PR 9 (done in the working tree, 2026-11-06).** The user chose to drop all three defaults:
  a blank Document Name, Section or Author is stored as `''`, not as `佛教常用詞`, `-` or
  `翻譯團隊`. `glossaryInsertFormSchema` keeps the three as required `z.string()` without
  transforms (so a post without them is still refused); `glossaryFormSchema.sutraName` lost its
  default and `entryFromCreateForm` maps blank to `''` (the create form's translation author
  was already `''`). The term's own author on create still falls back to `翻譯團隊` when the
  user has no username: that is the term, not a translation default. The placeholders are
  gone from both forms. The term card's `source | section` badge is now hidden when both are
  blank and shows only the one given (imports could already store blanks, which showed a bare
  `|`). Table comment updated; no schema or data change. Import, export and the duplicate
  compare already treated a blank source as blank and are unchanged. Checked: tsc, 500 tests,
  eslint/prettier on touched files, 3 mutation checks (each default put back fails a test).
  Not checked in a browser yet: Insert with everything optional blank, and Create the same.

  The original plan text:
  **stop filling in a default sutra.** A blank Sutra Name is stored as is, not as the
  placeholder `佛教常用詞` ("no source"). Today the insert form's schema
  (`glossaryInsertFormSchema.sourceName`), the create form (`glossaryFormSchema.sutraName`
  default and `glossary.create.ts`) and the "佛教常用詞(default)" placeholders in
  `GlossaryList.tsx` and `_app.glossary.tsx` fill it in; the edit form already stores blank.
  **Forms only, by the user's choice:** no schema change (`source_name` stays not null with
  its default, so a blank is stored as `''`) and no data change (existing `佛教常用詞` rows
  stay, so both forms of "no source" coexist). Still to ask the user: whether volume (`-`)
  and author (`翻譯團隊`, or the username on create) stop being filled in too. Check the
  import (blank `SutraName`), the export and the duplicate compare (blank = null) with a
  blank source.
- **PR 10: reorganize the add-new-entry form** (`_app.glossary.tsx`, `glossaryFormSchema`,
  `glossary.create.ts`). **Agreed 2026-11-06:** group by what is stored, not by language.
  _Term_: Chinese Term, Phonetic (auto pinyin), and under "More" Discussion and CBETA
  Frequency. _First translation_: the Insert form's fields (Language, Translation, Rationale;
  under "Source" Document Name, Section, Origin Text, Target Text; under "More" Author, Part of
  Speech, Phonetic). Drop the two fields that were never stored (`volumeChinese`,
  `authorChinese`). Use the final names now: `sourceTerm`, `phonetic`, `discussion`,
  `cbetaFrequency`; `term`, `language`, `sourceName`, `volume`, `sourceText`, `targetText`,
  `author`, `partOfSpeech`, `rationale` (the translation's phonetic needs its own name, as the
  term's takes `phonetic`). Old details: The create form keeps its own
  old field names (`glossaryChinese`, `glossary`, `sutraName`, `sutraText`,
  `sutraTextChinese`); move them to the source/target names while reorganizing.
- **PR 11 (done in the working tree, 2026-11-06, before PR 10).** The headword is
  `sourceTerm` in code; the column is still `glossary` (`sourceTerm: text('glossary')`), so
  `pnpm db:generate` reports no change and no migration exists.
  - **How:** the language service's rename on three declarations (the table column, the edit
    form schema's `glossary`, the import preview's `ExistingGlossary.glossary`; 19 sites; it
    does not follow the column through Drizzle's `$inferSelect`). Then a script took tsc's
    errors (`Property 'glossary' does not exist`, excess `glossary` in a literal, `'glossary'`
    in a `Pick<GlossaryTerm, …>`) and renamed exactly the flagged tokens, skipping shorthand and
    destructuring (there were none). By hand: the inspector's column list (key `sourceTerm`,
    label still `glossary`, the column name), select aliases in `findIndexPage` and
    `glossary.inspect.ts`'s `TERM_KEYS`, `liveRowWithSameTerm` / `rowByNormalisedTerm` in
    `glossary.analyse.ts`, the dev seed data, the edit form's disabled Term input
    (`name="sourceTerm"`), and test literals that casts had hidden from tsc.
  - **Kept, on purpose:** the Algolia record and anything reading it (`IndexRecord.glossary`,
    `glossaryIndexRecord`'s `glossary` key, `attributesToRetrieve: ['glossary']`, the fixture
    cleanup's `hit.glossary`, the seed's `saveObjects`), so there is no re-index; the create form's
    `glossary` (the translation, PR 10 renames it); the file column `ChineseTerm`; the
    assistant's prompt (keyed by the headword's value); `translations[].glossary` in the
    Algolia partial update.
  - **Deploy window:** a page loaded before the deploy posts the edit form's headword as
    `glossary`; `sourceTerm` is required, so the post is refused (reload, redo). The edit action
    never saved the headword anyway (the input is disabled). Tests pin both.
  - **Checked:** tsc, 502 tests, eslint/prettier on the 25 touched files (all were clean
    before), `pnpm db:generate` (no change). On dev, read-only, old tree against new: the
    full CSV export, every search record and an index page are byte-identical (13,924 terms).
    Not checked in a browser: open Edit on an entry (Term shows the headword) and save; the
    inspector's term table and orphan list.

  The original plan text:
  **the headword `glossary` → `sourceTerm`** (the user's choice, 2026-11-06: `term`
  would clash with the translation's `term`; `sourceTerm` fits the source/target rule and the
  `ChineseTerm` / `EnglishTerm` file columns). The term-level field on `GlossaryTerm` /
  `GlossaryEntry`, the edit form's top-level `glossary`, the import preview, the store's
  queries. Rename by symbol, as in 8a/8b: `glossary` also names the feature, the page, the
  table and the Algolia key. **Code-only** unless the user decides otherwise: Drizzle maps
  the property to the existing column (`sourceTerm: text('glossary')`); renaming the column
  is a migration and needs approval. Keep the Algolia record's `glossary` (mapped in
  `glossary.record.ts`, no re-index), the file column `ChineseTerm` and the assistant's
  prompt shape.

Also open, not scheduled: remove `translationKey` (no caller since 7b; see 8b above).

### Column move: `glossaries.glossary` → `source_term` (agreed 2026-11-07)

The user wants the column to match the code's `sourceTerm` now, while there are few users, and
with no deploy ever breaking the code still live. Deploys run `pnpm build && pnpm db:migrate`
(`vercel.json`): the migration runs **before** the new code is live, while the previous
deployment still serves, so each migration must work with the code before it and after it.
The drizzle migrator runs each batch in one transaction (`ALTER TABLE` locks the table, so
nothing writes in between steps). A plain `RENAME COLUMN` would break every glossary read for
up to a minute; adding `source_term` and dropping `glossary` would put the column last
(Postgres orders columns by creation and has no `ADD COLUMN … AFTER`). So: a temporary
column, then a rename, which keeps `source_term` second, where `glossary` is.

Accepted by the user: a term created during the build minute of A or B can fail to save
(NOT NULL on the column the old code does not write); they retry. No data is lost otherwise.

| Deploy | Migration (runs first)                                                                                                  | Code (live after)              |
| ------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| A      | 0027: add `temp_term`, copy `glossary` into it, NOT NULL, unique index; `glossary` optional                             | `sourceTerm` → `temp_term`     |
| B      | 0028: rename `glossary` → `source_term`, copy `temp_term` back, `source_term` NOT NULL; `temp_term` optional            | `sourceTerm` → `source_term`   |
| C      | 0029: drop `temp_term` and its index                                                                                    | no change (legacy field gone)  |

**Deploy A (in the working tree, 2026-11-07).**

- `drizzle/tables/glossary.ts`: `sourceTerm: text('temp_term').notNull()`, unique index
  `glossaries_temp_term_idx`; the old column stays as `legacyGlossary: text('glossary')`
  (optional, still under `unique_glossary_idx`; nulls do not clash). Pattern from 7a:
  `LegacyGlossaryColumn` in `glossary.types.ts`, left out of `GlossaryTerm`, `termColumns`
  (so no read returns it) and `GlossaryTermInput` / `GlossaryTermUpdate`. Nothing else in the
  app names the column (no raw SQL does). Inspector column label `temp_term`.
- `0027_glossary-temp-term.sql`: generated, then edited by hand (drizzle-kit adds a NOT NULL
  column in one statement, which fails on a filled table): `ADD COLUMN temp_term text`,
  `UPDATE … SET temp_term = glossary`, `SET NOT NULL`, the unique index, `glossary DROP NOT
  NULL`. `pnpm db:generate` afterwards: no changes.
- During A's build minute the old code still writes `glossary` only: its inserts fail (NOT
  NULL on `temp_term`), its reads are unaffected. After A, new terms have `glossary` null.
- Checked: tsc, 503 tests (new: the term select reads `temp_term` and never `glossary`,
  mutation-checked), eslint/prettier on touched files.
- Committed on `switch-term` (2b9fdfc04), PR open. **Still to do, each needs the user's
  yes:** apply 0027 on dev (`pnpm db:migrate`), then
  read-only: old tree (HEAD) and new tree give the identical export and search records on the
  migrated DB (the old one simulates the code live during the build); `temp_term = glossary`
  on every row. Writes on ZZTEST fixtures with the new code (create, revive, import): new
  rows have `temp_term` set and `glossary` null; a duplicate term is refused by the new
  index. Before prod (merging runs 0027): a Neon restore point or a read-only dump of `id,
  glossary`.

**Deploy B (in the working tree on `switch-term`, 2026-11-07; merge only after A is live on
prod).** Done as specified below, with these details:

- `glossary.ts`: `sourceTerm: text('source_term')`, `legacyTempTerm: text('temp_term')`;
  `LegacyGlossaryColumn = 'legacyTempTerm'`; inspector label `source_term`; the store test now
  checks that the select reads `source_term` and never `temp_term`.
- `--custom` copies the **previous** snapshot, not the schema: 0028's snapshot was edited by
  hand (`glossary` → `source_term` NOT NULL, second; `temp_term` optional;
  `unique_glossary_idx` on `source_term`). Only `public.glossaries` differs from 0027's (the
  rest is key-order noise from drizzle-kit); `pnpm db:generate` reports no changes.
- 0028 drops `unique_glossary_idx` before the copy-back and recreates it after: a row-by-row
  UPDATE checks uniqueness per row, so a clash midway could fail it; the recreate still
  refuses real duplicates (and rolls the batch back, so the deploy fails safely).
- **Tested on a throwaway local Postgres 16** (docker `postgres:16-alpine`, migrations
  0000–0026 applied with psql, one transaction each): three terms (one trashed) → 0027
  (`temp_term = glossary` on all) → a term written as A's code would (`temp_term` only) →
  0028: `source_term` second and NOT NULL, all four terms right, `temp_term` optional, both
  unique indexes in place. Refused as expected: the old code's insert during A's build
  (`glossary` only), A's code's insert during B's build (`temp_term` only), duplicates in
  both phases. B's code's insert (`source_term` only) works.
- **Merge order matters.** If A and B were deployed as one, 0027 and 0028 would run while the
  pre-A code is live, and the rename would break its reads until the new code is up: merge B
  only once A's deployment is live (minutes are enough).

The original spec:

- Definition: `sourceTerm: text('source_term').notNull()` under `unique_glossary_idx` (the
  index follows the renamed column; renaming the index itself is optional and cosmetic);
  `legacyTempTerm: text('temp_term')` (optional) under `glossaries_temp_term_idx`;
  `LegacyGlossaryColumn` becomes `'legacyTempTerm'`.
- 0028, hand-written (drizzle-kit asks interactively whether a column was renamed): create it
  with `pnpm db:generate --custom --name glossary-source-term` after editing the definition
  (check that its snapshot is the new schema), then `ALTER TABLE "glossaries" RENAME COLUMN
  "glossary" TO "source_term"; UPDATE "glossaries" SET "source_term" = "temp_term" WHERE
  "source_term" IS DISTINCT FROM "temp_term"; ALTER … "source_term" SET NOT NULL; ALTER …
  "temp_term" DROP NOT NULL;`. Afterwards `pnpm db:generate` must report no changes.
- A's code (live during B's build) reads and writes `temp_term` only: unaffected, except its
  inserts fail for that minute (NOT NULL on `source_term`). The copy-back is what keeps every
  term created or changed while A was live. On dev: check `source_term = temp_term` on all
  rows and that the column is still second.

**Deploy C (after B is live).** Remove `legacyTempTerm`, its index and `LegacyGlossaryColumn`
(back to `termColumns = getTableColumns(…)`, `GlossaryTerm = ReadGlossary`); `pnpm
db:generate --name drop-glossary-temp-term` writes the DROP INDEX / DROP COLUMN, no hand
edit. B's code does not touch `temp_term`, so nothing breaks. Update the dbml and the
inspector label (`source_term`) along the way.

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
  `pnpm exec dotenv -e .env -- pnpm exec tsx ./.tmp-x.ts` (`npx dotenv` fetches an unrelated
  package), deleted afterwards. `.env` holds several `DATABASE_URL` lines; dotenv takes the
  first (dev, `ep-bold-band`). Prod (`.env.prod`) is `ep-nameless-pond`.
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
8. **PR 8: rename** read-shape fields to the table's names. 8a: `sutraName` → `sourceName`,
   `originSutraText` → `sourceText`, `targetSutraText` → `targetText` (see "Where we are").
   8b: `glossary` → `term` for the rendering. File columns, the Algolia record and the
   assistant's prompt shape keep their names.
9. **PR 9 (committed, 93d08da32):** forms stop filling in `佛教常用詞`, `-` and `翻譯團隊` (see "Where we are").
10. **PR 10:** reorganize the add-new-entry form.
11. **PR 11 (working tree, done before PR 10):** the headword `glossary` → `sourceTerm`, code-only.

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
