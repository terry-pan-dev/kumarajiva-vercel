-- Column move, deploy C (docs/plans/glossary-refactor.md, "Column move"): drop temp_term, where
-- deploy A kept the headword. Deploy B's code, live while this runs, no longer uses it.
DROP INDEX "glossaries_temp_term_idx";--> statement-breakpoint
ALTER TABLE "glossaries" DROP COLUMN "temp_term";--> statement-breakpoint
-- A translation's rationale becomes its discussion (the user's choice, 2026-11-07: more generic).
-- Added by hand (drizzle-kit would ask interactively; this file's snapshot edited to match).
-- Deploy B's code still reads `rationale`, so glossary reads fail between this migration and
-- the new code going live (about a minute); accepted by the user, as no translation uses it yet.
ALTER TABLE "glossary_translations" RENAME COLUMN "rationale" TO "discussion";
