CREATE TABLE "project_references" (
	"project_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"order" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "project_references_project_id_document_id_pk" PRIMARY KEY("project_id","document_id")
);
--> statement-breakpoint
ALTER TABLE "project_references" ADD CONSTRAINT "project_references_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_references" ADD CONSTRAINT "project_references_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;