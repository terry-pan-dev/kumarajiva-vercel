-- Enforce that the denormalised work_id on sections/projects matches the work of
-- the document(s) they reference, via composite foreign keys into
-- documents(id, work_id). The composite unique key must be created BEFORE the
-- FKs that reference it, so the ordering here differs from drizzle-kit's default.

ALTER TABLE "projects" DROP CONSTRAINT "projects_source_document_id_documents_id_fk";
--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT "projects_target_document_id_documents_id_fk";
--> statement-breakpoint
ALTER TABLE "sections" DROP CONSTRAINT "sections_document_id_documents_id_fk";
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_id_work_id_unique" UNIQUE("id","work_id");--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_source_document_id_work_id_fk" FOREIGN KEY ("source_document_id","work_id") REFERENCES "public"."documents"("id","work_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_target_document_id_work_id_fk" FOREIGN KEY ("target_document_id","work_id") REFERENCES "public"."documents"("id","work_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_document_id_work_id_fk" FOREIGN KEY ("document_id","work_id") REFERENCES "public"."documents"("id","work_id") ON DELETE no action ON UPDATE no action;
