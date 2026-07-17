ALTER TABLE "sections" ALTER COLUMN "order" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "work_id" uuid;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE no action ON UPDATE no action;