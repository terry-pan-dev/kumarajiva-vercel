# Glossary refactor: translations out of the JSON blob

Status: **PR 1, 2, 3a merged; PR 3b written** (`glossary.store.ts` replaces `glossary.crud.ts`). Written 2026-11-04, updated 2026-11-05.
`glossary_translations` (`drizzle/tables/glossary.ts`, migration `0025`) exists on dev,
empty; not yet on prod (applied by the PR 1 merge). Data script 08 is written; dev dry run:
13,920 terms, 17,357 rows, 1 duplicate (癡), no issues. Not applied anywhere, and by the
user's decision it is **not run on dev or prod until PR 4** (dev when PR 4 work starts).

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
   - **3c: writes.** The store owns create-with-translations, replace (edit, revive) and
     append (insert, import). Pure functions PR 4 needs, with tests: edit-form diff by id
     and import matching (id first, then `translationKey()`).
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
7. **PR 7: migration B.** Drop `glossaries.translations` and `glossaries.subscribers`;
   remove the JSON type. Only after step 5 passes.
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
4. **`subscribers`:** drop it in PR 7.
5. **Field names:** keep today's names in the read shape for PRs 3–4; rename in PR 8.
   Naming rule for new code: **source / target** (as in `projects.source_document_id`).
   `origin` is legacy; avoid `translation` as the counterpart of `source`, since it already
   means a glossary row, a project and the activity.

## Related state at hand-over (not part of this refactor)

- Paragraph search and the Paragraphs data page run on `paragraphs_new`. The Algolia
  paragraph index has been rebuilt; run `pnpm search:rebuild --apply` (and `:prod`) once to
  apply the index settings (search only the text, typo fallback, phrase search).
- Paragraph history and comments: deferred. Nobody uses them yet.
- `users.origin_lang` / `target_lang` are no longer read. They are still `NOT NULL`, so
  `createUser` writes a placeholder (`app/services/user.service.ts`). Dropping them is
  optional cleanup and needs approval. No native-language field is wanted.
