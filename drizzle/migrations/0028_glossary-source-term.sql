-- Column move, deploy B (docs/plans/glossary-refactor.md, "Column move"). Written by hand
-- (drizzle-kit generate --custom; its snapshot edited to match): drizzle-kit would ask
-- interactively whether glossary was renamed.
--
-- Deploy A's code, live while this runs, reads and writes temp_term only, so the rename does
-- not affect it. Since deploy A, glossary is stale (null for new terms): copy temp_term back
-- before requiring it. RENAME keeps the column in place (second), where glossary was.
ALTER TABLE "glossaries" RENAME COLUMN "glossary" TO "source_term";--> statement-breakpoint
-- The unique index followed the rename. Rebuilt around the copy, so a clash midway through the
-- row-by-row UPDATE cannot fail it; the rebuild still refuses real duplicates (and rolls back).
DROP INDEX "unique_glossary_idx";--> statement-breakpoint
UPDATE "glossaries" SET "source_term" = "temp_term" WHERE "source_term" IS DISTINCT FROM "temp_term";--> statement-breakpoint
ALTER TABLE "glossaries" ALTER COLUMN "source_term" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "unique_glossary_idx" ON "glossaries" USING btree ("source_term");--> statement-breakpoint
-- Deploy B's code no longer writes temp_term; deploy C drops it.
ALTER TABLE "glossaries" ALTER COLUMN "temp_term" DROP NOT NULL;
