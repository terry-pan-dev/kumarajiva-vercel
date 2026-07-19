import { foreignKey, integer, pgTable, text, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';

import { auditAtFields, auditByFields } from '../audit';
import { documentsTable } from './document';
import { worksTable } from './work';

export const sectionsTable = pgTable(
  'sections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workId: uuid('work_id')
      .references(() => worksTable.id)
      .notNull(),
    // No standalone FK to documents.id: the composite FK below both proves the
    // document exists and forces work_id to match that document's work.
    documentId: uuid('document_id').notNull(),
    parentId: uuid('parent_id').references((): AnyPgColumn => sectionsTable.id),
    title: text('title'),
    order: integer('order').notNull().default(1),
    ...auditAtFields,
    ...auditByFields,
  },
  (t) => [
    foreignKey({
      columns: [t.documentId, t.workId],
      foreignColumns: [documentsTable.id, documentsTable.workId],
      name: 'sections_document_id_work_id_fk',
    }),
  ],
);

export type ReadSection = typeof sectionsTable.$inferSelect;
export type CreateSection = typeof sectionsTable.$inferInsert;
export type UpdateSection = Partial<CreateSection>;
