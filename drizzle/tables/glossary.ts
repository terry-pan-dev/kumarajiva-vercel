import { sql } from 'drizzle-orm';
import { integer, json, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { type Lang } from '~/utils/constants';

import { auditAtFields, auditByFields } from '../audit';

export const glossariesTable = pgTable(
  'glossaries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    glossary: text('glossary').notNull(),
    phonetic: text('phonetic'),
    subscribers: integer('subscribers').default(0),
    author: text('author'),
    cbetaFrequency: text('cbeta_frequency'),
    translations: json()
      .$type<
        {
          glossary: string;
          language: Lang;
          sutraName: string;
          volume: string;
          updatedBy: string;
          updatedAt: string;
          originSutraText?: string | null;
          targetSutraText?: string | null;
          author?: string | null;
          partOfSpeech?: string | null;
          phonetic?: string | null;
        }[]
      >()
      .default([]),
    discussion: text('discussion'),
    searchId: text('search_id').default(sql`NULL`),
    ...auditAtFields,
    ...auditByFields,
  },
  (t) => ({
    uniqueGlossaryIdx: uniqueIndex('unique_glossary_idx').on(t.glossary),
  }),
);

export type ReadGlossary = typeof glossariesTable.$inferSelect;
export type CreateGlossary = typeof glossariesTable.$inferInsert;
export type UpdateGlossary = Partial<CreateGlossary>;
