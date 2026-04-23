import { pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { documentsTable } from './document';
import { contributorRoleEnum } from './enums';

export const contributorsTable = pgTable('contributors', {
  id: uuid('id').primaryKey().defaultRandom(),
  documentId: uuid('document_id')
    .references(() => documentsTable.id)
    .notNull(),
  name: text('name').notNull(),
  role: contributorRoleEnum('role').notNull(),
});

export type ReadContributor = typeof contributorsTable.$inferSelect;
export type CreateContributor = typeof contributorsTable.$inferInsert;
export type UpdateContributor = Partial<CreateContributor>;
