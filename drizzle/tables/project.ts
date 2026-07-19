import { boolean, foreignKey, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { auditAtFields, auditByFields } from '../audit';
import { documentsTable } from './document';
import { teamsTable } from './team';
import { worksTable } from './work';

export const projectsTable = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    workId: uuid('work_id')
      .references(() => worksTable.id)
      .notNull(),
    // No standalone FKs to documents.id: the composite FKs below prove each
    // document exists AND force both to share this project's work_id — so a
    // project can never straddle two works.
    sourceDocumentId: uuid('source_document_id').notNull(),
    targetDocumentId: uuid('target_document_id').notNull(),
    finish: boolean('finish').notNull().default(false),
    teamId: uuid('team_id')
      .references(() => teamsTable.id)
      .notNull(),
    ...auditAtFields,
    ...auditByFields,
  },
  (t) => [
    foreignKey({
      columns: [t.sourceDocumentId, t.workId],
      foreignColumns: [documentsTable.id, documentsTable.workId],
      name: 'projects_source_document_id_work_id_fk',
    }),
    foreignKey({
      columns: [t.targetDocumentId, t.workId],
      foreignColumns: [documentsTable.id, documentsTable.workId],
      name: 'projects_target_document_id_work_id_fk',
    }),
  ],
);

export type ReadProject = typeof projectsTable.$inferSelect;
export type CreateProject = typeof projectsTable.$inferInsert;
export type UpdateProject = Partial<CreateProject>;
