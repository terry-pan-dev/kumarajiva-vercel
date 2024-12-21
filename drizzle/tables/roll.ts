import { relations } from 'drizzle-orm';
import { pgTable, text, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';

import { auditAtFields, auditByFields } from '../audit';
import { paragraphsTable } from './paragraph';
import { sutrasTable } from './sutra';

export const rollsTable = pgTable('rolls', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  subtitle: text('subtitle').notNull(),
  parentId: uuid('parent_id').references((): AnyPgColumn => rollsTable.id),
  sutraId: uuid('sutra_id')
    .references(() => sutrasTable.id)
    .notNull(),
  ...auditAtFields,
  ...auditByFields,
});

export const rollsTableRelations = relations(rollsTable, ({ one, many }) => ({
  sutra: one(sutrasTable, {
    fields: [rollsTable.sutraId],
    references: [sutrasTable.id],
  }),
  children: one(rollsTable, {
    fields: [rollsTable.id],
    references: [rollsTable.parentId],
  }),
  parent: one(rollsTable, {
    fields: [rollsTable.parentId],
    references: [rollsTable.id],
  }),
  paragraphs: many(paragraphsTable),
}));

export type ReadRoll = typeof rollsTable.$inferSelect;
export type ReadRollWithSutra = typeof rollsTable.$inferSelect & {
  sutra: typeof sutrasTable.$inferSelect;
};
export type CreateRoll = typeof rollsTable.$inferInsert;
export type UpdateRoll = Partial<CreateRoll>;
