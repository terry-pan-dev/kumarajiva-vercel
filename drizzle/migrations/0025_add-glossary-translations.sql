CREATE TABLE "glossary_translations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"glossary_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"language" "lang" DEFAULT 'english' NOT NULL,
	"term" text NOT NULL,
	"source_name" text DEFAULT '佛教常用詞' NOT NULL,
	"volume" text DEFAULT '-' NOT NULL,
	"source_text" text,
	"target_text" text,
	"author" text,
	"rationale" text,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "glossary_translations" ADD CONSTRAINT "glossary_translations_glossary_id_glossaries_id_fk" FOREIGN KEY ("glossary_id") REFERENCES "public"."glossaries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "glossary_translations_glossary_id_idx" ON "glossary_translations" USING btree ("glossary_id");