CREATE TYPE "public"."contributor_role" AS ENUM('author', 'translator', 'commentator', 'editor');--> statement-breakpoint
CREATE TABLE "contributors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"name" text NOT NULL,
	"role" "contributor_role" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_id" uuid NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"language" "lang" NOT NULL,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
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
CREATE TABLE "works" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"cbeta" text NOT NULL,
	"category" text NOT NULL,
	"passage_key_prefix" text NOT NULL,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "language" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "paragraphs" ALTER COLUMN "language" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "sutras" ALTER COLUMN "language" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "sutras" ALTER COLUMN "language" SET DEFAULT 'chinese'::text;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "origin_lang" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "target_lang" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."lang";--> statement-breakpoint
CREATE TYPE "public"."lang" AS ENUM('chinese', 'english', 'sanskrit', 'indonesian');--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "language" SET DATA TYPE "public"."lang" USING "language"::"public"."lang";--> statement-breakpoint
ALTER TABLE "paragraphs" ALTER COLUMN "language" SET DATA TYPE "public"."lang" USING "language"::"public"."lang";--> statement-breakpoint
ALTER TABLE "sutras" ALTER COLUMN "language" SET DEFAULT 'chinese'::"public"."lang";--> statement-breakpoint
ALTER TABLE "sutras" ALTER COLUMN "language" SET DATA TYPE "public"."lang" USING "language"::"public"."lang";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "origin_lang" SET DATA TYPE "public"."lang" USING "origin_lang"::"public"."lang";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "target_lang" SET DATA TYPE "public"."lang" USING "target_lang"::"public"."lang";--> statement-breakpoint
ALTER TABLE "contributors" ADD CONSTRAINT "contributors_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_source_document_id_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_target_document_id_documents_id_fk" FOREIGN KEY ("target_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;