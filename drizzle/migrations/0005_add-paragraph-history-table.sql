CREATE TABLE IF NOT EXISTS "paragraphs_history" (
	"paragraph_id" uuid NOT NULL,
	"old_content" text NOT NULL,
	"new_content" text NOT NULL,
	"updated_at" timestamp NOT NULL,
	"updated_by" uuid NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "paragraphs_history" ADD CONSTRAINT "paragraphs_history_paragraph_id_paragraphs_id_fk" FOREIGN KEY ("paragraph_id") REFERENCES "public"."paragraphs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
