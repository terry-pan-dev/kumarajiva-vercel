import { relations, sql } from 'drizzle-orm';
import { pgTable, text, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { auditAtFields, auditByFields } from '../audit';
import { langEnum } from './enums';
import { referencesTable } from './reference';
import { rollsTable } from './roll';

export const paragraphsTable = pgTable('paragraphs', {
  id: uuid('id').primaryKey().defaultRandom(),
  content: text('content').notNull(),
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
}));

export type ReadParagraph = typeof paragraphsTable.$inferSelect;
export type CreateParagraph = typeof paragraphsTable.$inferInsert;
export type UpdateParagraph = Partial<CreateParagraph>;
