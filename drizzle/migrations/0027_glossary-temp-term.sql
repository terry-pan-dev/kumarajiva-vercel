-- Column move, deploy A (docs/plans/glossary-refactor.md, "Column move"): the headword moves to
-- temp_term; the code reads and writes only temp_term from this deploy on. Deploy B renames
-- glossary to source_term and copies temp_term back; deploy C drops temp_term.
-- Edited by hand after drizzle-kit generate: add the column, fill it, then require it.
ALTER TABLE "glossaries" ADD COLUMN "temp_term" text;--> statement-breakpoint
UPDATE "glossaries" SET "temp_term" = "glossary";--> statement-breakpoint
ALTER TABLE "glossaries" ALTER COLUMN "temp_term" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "glossaries_temp_term_idx" ON "glossaries" USING btree ("temp_term");--> statement-breakpoint
-- New terms leave glossary null from now on.
ALTER TABLE "glossaries" ALTER COLUMN "glossary" DROP NOT NULL;
