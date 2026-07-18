ALTER TABLE "section_titles" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "section_titles" CASCADE;--> statement-breakpoint
DELETE FROM "sections";--> statement-breakpoint
DELETE FROM "projects";--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "work_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sections" ADD COLUMN "document_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "sections" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" DROP COLUMN "key";