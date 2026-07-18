import { integer, pgTable, text, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';

import { auditAtFields, auditByFields } from '../audit';
import { documentsTable } from './document';
import { worksTable } from './work';

export const sectionsTable = pgTable('sections', {
  id: uuid('id').primaryKey().defaultRandom(),
  workId: uuid('work_id')
    .references(() => worksTable.id)
    .notNull(),
  documentId: uuid('document_id')
    .references(() => documentsTable.id)
    .notNull(),
  parentId: uuid('parent_id').references((): AnyPgColumn => sectionsTable.id),
  title: text('title'),
  order: integer('order').notNull().default(1),
  ...auditAtFields,
  ...auditByFields,
});

export type ReadSection = typeof sectionsTable.$inferSelect;
export type CreateSection = typeof sectionsTable.$inferInsert;
export type UpdateSection = Partial<CreateSection>;
