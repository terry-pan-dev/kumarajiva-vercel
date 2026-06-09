import { pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { auditAtFields, auditByFields } from '../audit';
import { documentsTable } from './document';
import { sectionsTable } from './section';

export const sectionTitlesTable = pgTable('section_titles', {
  id: uuid('id').primaryKey().defaultRandom(),
  documentId: uuid('document_id')
    .references(() => documentsTable.id)
    .notNull(),
  sectionId: uuid('section_id')
    .references(() => sectionsTable.id)
    .notNull(),
  title: text('title'),
  ...auditAtFields,
  ...auditByFields,
});

export type ReadSectionTitle = typeof sectionTitlesTable.$inferSelect;
export type CreateSectionTitle = typeof sectionTitlesTable.$inferInsert;
export type UpdateSectionTitle = Partial<CreateSectionTitle>;
