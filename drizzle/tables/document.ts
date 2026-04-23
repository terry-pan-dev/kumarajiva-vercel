import { pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { auditAtFields, auditByFields } from '../audit';
import { langEnum } from './enums';
import { worksTable } from './work';

export const documentsTable = pgTable('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  workId: uuid('work_id')
    .references(() => worksTable.id)
    .notNull(),
  title: text('title').notNull(),
  subtitle: text('subtitle'),
  language: langEnum('language').notNull(),
  ...auditAtFields,
  ...auditByFields,
});

export type ReadDocument = typeof documentsTable.$inferSelect;
export type CreateDocument = typeof documentsTable.$inferInsert;
export type UpdateDocument = Partial<CreateDocument>;
