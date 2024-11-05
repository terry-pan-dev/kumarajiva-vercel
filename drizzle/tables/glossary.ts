import { integer, json, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { auditAtFields, auditByFields } from '../audit';
import { type Lang } from './enums';

export const glossariesTable = pgTable('glossaries', {
  id: uuid('id').primaryKey().defaultRandom(),
  glossary: text('origin').notNull(),
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
  ...auditAtFields,
  ...auditByFields,
});

export type ReadGlossary = typeof glossariesTable.$inferSelect;
export type CreateGlossary = typeof glossariesTable.$inferInsert;
export type UpdateGlossary = Partial<CreateGlossary>;
