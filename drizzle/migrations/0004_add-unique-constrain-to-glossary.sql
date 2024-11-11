ALTER TABLE "glossaries" RENAME COLUMN "origin" TO "glossary";--> statement-breakpoint
DROP INDEX IF EXISTS "unique_glossary_idx";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unique_glossary_idx" ON "glossaries" USING btree ("glossary");