import { json, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';

import { auditAtFields, auditByFields } from '../audit';
import { langEnum } from './enums';
import { worksTable } from './work';

export const documentsTable = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workId: uuid('work_id')
      .references(() => worksTable.id)
      .notNull(),
    title: text('title').notNull(),
    subtitle: text('subtitle'),
    language: langEnum('language').notNull(),
    metadata: json('metadata').$type<Record<string, unknown>>(),
    ...auditAtFields,
    ...auditByFields,
  },
  (t) => [
    // Composite unique key so sections/projects can reference (id, work_id) and
    // let the database guarantee their denormalised work_id matches this
    // document's work. id is already unique, so this never rejects a real row.
    unique('documents_id_work_id_unique').on(t.id, t.workId),
  ],
);

export type ReadDocument = typeof documentsTable.$inferSelect;
export type CreateDocument = typeof documentsTable.$inferInsert;
export type UpdateDocument = Partial<CreateDocument>;
