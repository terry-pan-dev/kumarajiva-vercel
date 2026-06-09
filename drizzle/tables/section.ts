import { integer, pgTable, text, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';

import { auditAtFields, auditByFields } from '../audit';
import { worksTable } from './work';

export const sectionsTable = pgTable('sections', {
  id: uuid('id').primaryKey().defaultRandom(),
  workId: uuid('work_id')
    .references(() => worksTable.id)
    .notNull(),
  parentId: uuid('parent_id').references((): AnyPgColumn => sectionsTable.id),
  key: text('key'),
  order: integer('order').notNull().default(0),
  ...auditAtFields,
  ...auditByFields,
});

export type ReadSection = typeof sectionsTable.$inferSelect;
export type CreateSection = typeof sectionsTable.$inferInsert;
export type UpdateSection = Partial<CreateSection>;
