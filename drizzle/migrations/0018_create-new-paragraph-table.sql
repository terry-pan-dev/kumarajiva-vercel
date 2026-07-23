CREATE TABLE "paragraphs_new" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order" integer DEFAULT 1 NOT NULL,
	"passage_key" text,
	"document_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"content" text NOT NULL,
	"search_id" text DEFAULT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "paragraphs_new" ADD CONSTRAINT "paragraphs_new_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paragraphs_new" ADD CONSTRAINT "paragraphs_new_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE no action ON UPDATE no action;