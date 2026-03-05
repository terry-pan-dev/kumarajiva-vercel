import { boolean, pgTable, text, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';

import { auditAtFields, auditByFields } from '../audit';
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
  finish: boolean('finish').notNull().default(false),
  cbeta: text('cbeta').notNull(),
  teamId: uuid('team_id')
    .references(() => teamsTable.id)
    .notNull(),
  ...auditAtFields,
  ...auditByFields,
});

export type ReadSutra = typeof sutrasTable.$inferSelect;
export type CreateSutra = typeof sutrasTable.$inferInsert;
export type UpdateSutra = Partial<CreateSutra>;
