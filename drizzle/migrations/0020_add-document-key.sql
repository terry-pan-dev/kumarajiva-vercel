ALTER TABLE "documents" ADD COLUMN "key" text;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_work_id_key_unique" UNIQUE("work_id","key");