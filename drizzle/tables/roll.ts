import { pgTable, text, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';

import { auditAtFields, auditByFields } from '../audit';
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

export type ReadRoll = typeof rollsTable.$inferSelect;
export type ReadRollWithSutra = typeof rollsTable.$inferSelect & {
  sutra: typeof sutrasTable.$inferSelect;
};
export type CreateRoll = typeof rollsTable.$inferInsert;
export type UpdateRoll = Partial<CreateRoll>;
