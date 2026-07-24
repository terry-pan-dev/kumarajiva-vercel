import { integer, pgTable, primaryKey, uuid } from 'drizzle-orm/pg-core';

import { documentsTable } from './document';
import { projectsTable } from './project';

// Reference documents a project consults while translating, e.g. an earlier
// rendering or a commentary. Deliberately no denormalised work_id: unlike
// sections/projects, project_id already groups these rows for exploration, and
// a reference is not required to share the project's work.
export const projectReferencesTable = pgTable(
  'project_references',
  {
    projectId: uuid('project_id')
      .references(() => projectsTable.id)
      .notNull(),
    documentId: uuid('document_id')
      .references(() => documentsTable.id)
      .notNull(),
    order: integer('order').notNull().default(1),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.documentId], name: 'project_references_project_id_document_id_pk' })],
);

export type ReadProjectReference = typeof projectReferencesTable.$inferSelect;
export type CreateProjectReference = typeof projectReferencesTable.$inferInsert;
export type UpdateProjectReference = Partial<CreateProjectReference>;
