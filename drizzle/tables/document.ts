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
    // Short, stable handle for this document within its work, used as the column
    // header when importing/exporting a work's aligned documents. Nullable for
    // now (existing rows have none); the unique(work_id, key) below still allows
    // multiple NULLs, so it only bites once a document is actually keyed.
    key: text('key'),
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
    // A document key identifies a document within its work, so it must be unique
    // there. NULLs are exempt (Postgres treats them as distinct).
    unique('documents_work_id_key_unique').on(t.workId, t.key),
  ],
);

export type ReadDocument = typeof documentsTable.$inferSelect;
export type CreateDocument = typeof documentsTable.$inferInsert;
export type UpdateDocument = Partial<CreateDocument>;
