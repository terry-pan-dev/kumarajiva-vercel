import { relations } from 'drizzle-orm';
import { pgTable, text, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { auditAtFields, auditByFields } from '../audit';
import { rollsTable } from '../schema';
import { langEnum } from './enums';
import { teamsTable } from './team';

export const sutrasTable = pgTable('sutras', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  subtitle: text('subtitle'),
  category: text('category').notNull(),
  translator: text('translator').notNull(),
  language: langEnum('language').notNull().default('chinese'),
  parentId: uuid('parent_id').references((): AnyPgColumn => sutrasTable.id),
  teamId: uuid('team_id')
    .references(() => teamsTable.id)
    .notNull(),
  ...auditAtFields,
  ...auditByFields,
});

export const sutrasTableRelations = relations(sutrasTable, ({ one, many }) => ({
  team: one(teamsTable, {
    fields: [sutrasTable.teamId],
    references: [teamsTable.id],
  }),
  children: one(sutrasTable, {
    fields: [sutrasTable.id],
    references: [sutrasTable.parentId],
  }),
  parent: one(sutrasTable, {
    fields: [sutrasTable.parentId],
    references: [sutrasTable.id],
  }),
  rolls: many(rollsTable),
}));

export type ReadSutra = typeof sutrasTable.$inferSelect;
export type CreateSutra = typeof sutrasTable.$inferInsert;
export type UpdateSutra = Partial<CreateSutra>;
