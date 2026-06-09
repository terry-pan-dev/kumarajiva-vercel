-- Drop the old sections table (no other tables reference sections.id)
DROP TABLE IF EXISTS "sections";
--> statement-breakpoint

-- Recreate sections owned by works instead of documents
CREATE TABLE "sections" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "work_id" uuid NOT NULL,
    "parent_id" uuid,
    "key" text,
    "order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL,
    "deleted_at" timestamp,
    "created_by" text NOT NULL,
    "updated_by" text NOT NULL
);
--> statement-breakpoint

ALTER TABLE "sections" ADD CONSTRAINT "sections_work_id_works_id_fk"
  FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "sections" ADD CONSTRAINT "sections_parent_id_sections_id_fk"
  FOREIGN KEY ("parent_id") REFERENCES "public"."sections"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

-- Language-specific section titles, one row per (section, document) pair
CREATE TABLE "section_titles" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "section_id" uuid NOT NULL,
    "document_id" uuid NOT NULL,
    "title" text,
    "order" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL,
    "deleted_at" timestamp,
    "created_by" text NOT NULL,
    "updated_by" text NOT NULL
);
--> statement-breakpoint

ALTER TABLE "section_titles" ADD CONSTRAINT "section_titles_section_id_sections_id_fk"
  FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "section_titles" ADD CONSTRAINT "section_titles_document_id_documents_id_fk"
  FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;
