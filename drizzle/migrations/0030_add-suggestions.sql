CREATE TYPE "public"."review_verdict" AS ENUM('looks_right', 'needs_work');--> statement-breakpoint
CREATE TYPE "public"."suggestion_action" AS ENUM('create', 'edit', 'flag');--> statement-breakpoint
CREATE TYPE "public"."suggestion_status" AS ENUM('pending', 'accepted', 'rejected', 'withdrawn', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."suggestion_target" AS ENUM('glossary_term', 'glossary_translation');--> statement-breakpoint
CREATE TABLE "suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_kind" "suggestion_target" NOT NULL,
	"action" "suggestion_action" NOT NULL,
	"status" "suggestion_status" DEFAULT 'pending' NOT NULL,
	"glossary_id" uuid,
	"translation_id" uuid,
	"base" jsonb,
	"submitted" jsonb,
	"proposed" jsonb,
	"note" text,
	"context" jsonb,
	"enriched_by" text,
	"enriched_at" timestamp,
	"ready_by" text,
	"ready_at" timestamp,
	"review_verdict" "review_verdict",
	"review_note" text,
	"reviewed_by" text,
	"reviewed_at" timestamp,
	"decided_by" text,
	"decided_at" timestamp,
	"decision_note" text,
	"applied_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_glossary_id_glossaries_id_fk" FOREIGN KEY ("glossary_id") REFERENCES "public"."glossaries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_translation_id_glossary_translations_id_fk" FOREIGN KEY ("translation_id") REFERENCES "public"."glossary_translations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "suggestions_status_idx" ON "suggestions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "suggestions_glossary_id_idx" ON "suggestions" USING btree ("glossary_id");--> statement-breakpoint
CREATE INDEX "suggestions_translation_id_idx" ON "suggestions" USING btree ("translation_id");