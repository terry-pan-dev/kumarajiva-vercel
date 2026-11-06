# Legacy purge: what to drop once the new model is settled

Started 2026-11-06. This is a list, not a plan to act on. Nothing here gets dropped until the
user decides the replacement is exactly what we want. Each drop is a schema migration, so it
needs the user's explicit approval first. Take a prod export or dump of what is being dropped
before merging, because merging to main runs migrations on prod automatically (`vercel.json`).

**How things get onto this list.** First the code stops using the data. Then the data stays
in place, untouched, until the purge. **A column being phased out stays in its Drizzle table
definition**, renamed on the code side only (`legacyX: type('x')`) and marked `LEGACY`. If
it were deleted from the definition, the next `drizzle-kit generate` (for any unrelated
change) would write a `DROP COLUMN`, and the deploy would run it.

## Glossary

| What                                                                                                                                                                        | Status                                                                                                                                                                                                                                                  | When purging                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `glossaries.translations` (JSON), `legacyTranslations` in Drizzle                                                                                                           | Not read or written since PR 4 (#211, 2026-11-05). Every translation is in `glossary_translations`. Its contents are a **snapshot from 2026-11-05**, so it doesn't reflect later edits. Don't treat it as a backup.                                     | Drop the column. Remove `legacyTranslations` and its JSON type from `drizzle/tables/glossary.ts`. Remove item 2 below.                                                                                                                                      |
| Data script 08: `drizzle/migrations/data/08-glossary-translations.ts`, `08-glossary-translations.rows.ts`, their test, and `db:migrate:data:08` / `:prod` in `package.json` | One-off copy, done on dev and prod. It refuses to run once the table has rows. It is the only code that still reads the JSON column. `tests/glossary.rows.test.ts` uses its `planTerm` for a round trip.                                                | Delete together with the column. Drop the round-trip case or keep its expected rows inline.                                                                                                                                                                 |
| `glossaries.subscribers`                                                                                                                                                    | **Pending: depends on whether bookmarking stays.** Still live: every bookmark click adds or subtracts 1, and the term card shows it. The count drifts because bookmarks are kept in each browser's localStorage (`subscribedGlossaries`), not per user. | If bookmarking is removed: take out the bookmark button and action, `updateGlossarySubscribers`, the card counter, the inspector column and the Settings "Glossary Subscriptions" tab. Rename the column to `legacySubscribers`, then drop it at the purge. |

## Legacy translation tables (sutra / roll model)

Being replaced by works / documents / sections / `paragraphs_new`. Paragraph search and the
Paragraphs data page already run on the new tables. The tables below are **not obsolete
yet**: `app/services/crud.server.ts` and `app/services/file.server.ts` still reference them.
Paragraph history and comments have not been moved (deferred: nobody uses them yet).

| Table                | Still referenced by                                                                |
| -------------------- | ---------------------------------------------------------------------------------- |
| `sutras`             | `crud.server.ts`                                                                   |
| `rolls`              | `crud.server.ts`                                                                   |
| `paragraphs` (old)   | `crud.server.ts`, `file.server.ts`                                                 |
| `references`         | `crud.server.ts`, `file.server.ts`                                                 |
| `paragraphs_history` | `crud.server.ts` (history feature, deferred)                                       |
| `comments`           | `crud.server.ts` (comments feature, deferred; references `rolls` and `paragraphs`) |

Dormant code that goes with them, unreachable from the app but deliberately kept: `RollRow`,
`RollForm`, `SutraRow`, `SutraForm`, `components/data/types.ts`; on the server,
`replaceRollData`, `buildImportData`, `getExistingDataPreviewForRollId` (`file.server.ts`).

Drop order follows the foreign keys: `comments` and `paragraphs_history` first, then
`paragraphs` (which references `rolls` and itself), then `rolls`, then `sutras`.
