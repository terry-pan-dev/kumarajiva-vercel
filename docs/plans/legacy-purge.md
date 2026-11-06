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

## Legacy translation tables (sutra / roll model)

Being replaced by works / documents / sections / `paragraphs_new`. **No page uses these
tables any more** (checked 2026-11-06): the code that accesses them is still there, in
`app/services/crud.server.ts` (`DbSutras`, `DbRolls`, `DbParagraphs`, `DbReferences`,
`DbComments`, `DbHistory`), the services built on it (`sutra.service.ts`, `roll.service.ts`,
`paragraph.service.ts`, `reference.service.ts`) and `file.server.ts`, but no route imports
those services. Paragraph history and comments have not been moved to the new tables yet
(deferred: nobody uses them).

| Table                | Accessing code (unused by the app)                                                 |
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

## Done

- **Glossary, 2026-11-06 (PR 7, migration `0026`):** dropped `glossaries.translations` (the JSON
  array, replaced by `glossary_translations`) and `glossaries.subscribers` (the bookmark
  counter, 0 on every prod term). Removed data script 08 with its tests and package scripts.
  Before the drop, a read-only dump of both columns for all 15,027 prod terms (19,325 JSON
  translations, trashed terms included) was taken and kept by the user.
