import { relations, sql } from 'drizzle-orm';
import { integer, pgTable, text, timestamp, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { auditAtFields, auditByFields } from '../audit';
import { langEnum } from './enums';
import { referencesTable } from './reference';
import { rollsTable } from './roll';

export const paragraphsTable = pgTable('paragraphs', {
  id: uuid('id').primaryKey().defaultRandom(),
  content: text('content').notNull(),
  // number of the paragraph in the roll, this is the main order
  number: integer('number').notNull().default(0),
  // this is for added new order, for example if we add a new paragraph after
  // number 5, the number will still be 5, but the order will be 5.1
  order: text('order').notNull().default('0'),
  language: langEnum('language').notNull(),
  parentId: uuid('parent_id').references((): AnyPgColumn => paragraphsTable.id),
  rollId: uuid('roll_id')
    .references(() => rollsTable.id)
    .notNull(),
  searchId: text('search_id').default(sql`NULL`),
  ...auditAtFields,
  ...auditByFields,
});

export const paragraphsHistoryTable = pgTable('paragraphs_history', {
  paragraphId: uuid('paragraph_id')
    .references(() => paragraphsTable.id)
    .notNull(),
  oldContent: text('old_content').notNull(),
  newContent: text('new_content').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
  updatedBy: text('updated_by').notNull(),
});

export const paragraphsHistoryTableRelations = relations(paragraphsHistoryTable, ({ one }) => ({
  paragraph: one(paragraphsTable, {
    fields: [paragraphsHistoryTable.paragraphId],
    references: [paragraphsTable.id],
  }),
}));

export const paragraphsTableRelations = relations(paragraphsTable, ({ one, many }) => ({
  roll: one(rollsTable, {
    fields: [paragraphsTable.rollId],
    references: [rollsTable.id],
  }),
  children: one(paragraphsTable, {
    fields: [paragraphsTable.id],
    references: [paragraphsTable.parentId],
  }),
  parent: one(paragraphsTable, {
    fields: [paragraphsTable.parentId],
    references: [paragraphsTable.id],
  }),
  references: many(referencesTable),
  history: many(paragraphsHistoryTable),
}));

export type ReadParagraph = typeof paragraphsTable.$inferSelect;
export type CreateParagraph = typeof paragraphsTable.$inferInsert;
export type UpdateParagraph = Partial<CreateParagraph>;
