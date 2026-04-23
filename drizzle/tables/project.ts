import { boolean, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { auditAtFields, auditByFields } from '../audit';
import { documentsTable } from './document';
import { teamsTable } from './team';

export const projectsTable = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  sourceDocumentId: uuid('source_document_id')
    .references(() => documentsTable.id)
    .notNull(),
  targetDocumentId: uuid('target_document_id')
    .references(() => documentsTable.id)
    .notNull(),
  finish: boolean('finish').notNull().default(false),
  teamId: uuid('team_id')
    .references(() => teamsTable.id)
    .notNull(),
  ...auditAtFields,
  ...auditByFields,
});

export type ReadProject = typeof projectsTable.$inferSelect;
export type CreateProject = typeof projectsTable.$inferInsert;
export type UpdateProject = Partial<CreateProject>;
