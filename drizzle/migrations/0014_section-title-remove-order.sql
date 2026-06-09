ALTER TABLE "section_titles" DROP COLUMN "order";--> statement-breakpoint
ALTER TABLE "sections" ALTER COLUMN "order" SET DEFAULT 1;
