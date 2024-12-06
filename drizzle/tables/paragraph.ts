import { relations, sql } from 'drizzle-orm';
import { type AnyPgColumn, timestamp, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { auditAtFields, auditByFields } from '../audit';
import { langEnum } from './enums';
import { referencesTable } from './reference';
import { rollsTable } from './roll';

export const paragraphsTable = pgTable('paragraphs', {
  parentId: uuid('parent_id').references((): AnyPgColumn => paragraphsTable.id),
  rollId: uuid('roll_id')
    .references(() => rollsTable.id)
    .notNull(),
  // number of the paragraph in the roll, this is the main order
  number: integer('number').notNull().default(0),
  searchId: text('search_id').default(sql`NULL`),
  id: uuid('id').primaryKey().defaultRandom(),
  // this is for added new order, for example if we add a new paragraph after
  // number 5, the number will still be 5, but the order will be 5.1
  order: text('order').notNull().default('0'),
  language: langEnum('language').notNull(),
  content: text('content').notNull(),
  ...auditAtFields,
  ...auditByFields,
});

export const paragraphsHistoryTable = pgTable('paragraphs_history', {
  paragraphId: uuid('paragraph_id')
    .references(() => paragraphsTable.id)
    .notNull(),
  updatedAt: timestamp('updated_at').notNull(),
  oldContent: text('old_content').notNull(),
  newContent: text('new_content').notNull(),
  updatedBy: text('updated_by').notNull(),
});

export const paragraphsHistoryTableRelations = relations(paragraphsHistoryTable, ({ one }) => ({
  paragraph: one(paragraphsTable, {
    fields: [paragraphsHistoryTable.paragraphId],
    references: [paragraphsTable.id],
  }),
}));

export const paragraphsTableRelations = relations(paragraphsTable, ({ many, one }) => ({
  children: one(paragraphsTable, {
    references: [paragraphsTable.parentId],
    fields: [paragraphsTable.id],
  }),
  parent: one(paragraphsTable, {
    fields: [paragraphsTable.parentId],
    references: [paragraphsTable.id],
  }),
  roll: one(rollsTable, {
    fields: [paragraphsTable.rollId],
    references: [rollsTable.id],
  }),
  history: many(paragraphsHistoryTable),
  references: many(referencesTable),
}));

export type CreateParagraph = typeof paragraphsTable.$inferInsert;
export type ReadParagraph = typeof paragraphsTable.$inferSelect;
export type UpdateParagraph = Partial<CreateParagraph>;
export type ReadHistory = typeof paragraphsHistoryTable.$inferSelect;
