-- Revert to document-based sections and drop the language-specific title table.
--
-- `projects` and `sections` are dropped and recreated from scratch (rather than
-- ALTERed) so their physical column order matches a fresh create from the schema.
-- ALTER TABLE ... ADD COLUMN appends new columns at the end, which left work_id
-- (projects) and document_id/title (sections) out of schema order. No other table
-- references either of these, so dropping is safe. Data is repopulated by the
-- 07-sections-and-projects data migration.

ALTER TABLE "section_titles" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "section_titles" CASCADE;--> statement-breakpoint

DROP TABLE IF EXISTS "projects" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "sections" CASCADE;--> statement-breakpoint

CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"work_id" uuid NOT NULL,
	"source_document_id" uuid NOT NULL,
	"target_document_id" uuid NOT NULL,
	"finish" boolean DEFAULT false NOT NULL,
	"team_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint

CREATE TABLE "sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"parent_id" uuid,
	"title" text,
	"order" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint

ALTER TABLE "projects" ADD CONSTRAINT "projects_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_source_document_id_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_target_document_id_documents_id_fk" FOREIGN KEY ("target_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "sections" ADD CONSTRAINT "sections_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_parent_id_sections_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."sections"("id") ON DELETE no action ON UPDATE no action;
