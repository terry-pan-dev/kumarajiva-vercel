import { relations } from 'drizzle-orm';
import { pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { auditAtFields, auditByFields } from '../audit';
import { paragraphsTable } from './paragraph';

export const referencesTable = pgTable('references', {
  paragraphId: uuid('paragraph_id')
    .references(() => paragraphsTable.id)
    .notNull(),
  id: uuid('id').primaryKey().defaultRandom(),
  order: text('order').notNull().default('0'),
  sutraName: text('sutra_name').notNull(),
  content: text('content').notNull(),
  ...auditAtFields,
  ...auditByFields,
});

export const referencesTableRelations = relations(referencesTable, ({ one }) => ({
  paragraph: one(paragraphsTable, {
    fields: [referencesTable.paragraphId],
    references: [paragraphsTable.id],
  }),
}));

export type CreateReference = typeof referencesTable.$inferInsert;
export type ReadReference = typeof referencesTable.$inferSelect;
export type UpdateReference = Partial<CreateReference>;
