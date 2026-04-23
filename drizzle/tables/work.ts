import { json, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { auditAtFields, auditByFields } from '../audit';

export const worksTable = pgTable('works', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  cbeta: text('cbeta').notNull(),
  category: text('category').notNull(),
  passageKeyPrefix: text('passage_key_prefix').notNull(),
  metadata: json('metadata').$type<Record<string, unknown>>(),
  ...auditAtFields,
  ...auditByFields,
});

export type ReadWork = typeof worksTable.$inferSelect;
export type CreateWork = typeof worksTable.$inferInsert;
export type UpdateWork = Partial<CreateWork>;
