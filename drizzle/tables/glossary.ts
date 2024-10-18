import { index, pgTable, text, uuid, vector } from 'drizzle-orm/pg-core';
import { auditAtFields, auditByFields } from '../audit';

export const glossariesTable = pgTable(
  'glossaries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    origin: text('origin').notNull(),
    target: text('target').notNull(),
    originLang: text('origin_lang'),
    targetLang: text('target_lang'),
    originSutraText: text('origin_sutra_text'),
    targetSutraText: text('target_sutra_text'),
    sutraName: text('sutra_name'),
    volume: text('volume'),
    cbetaFrequency: text('cbeta_frequency'),
    glossaryAuthor: text('glossary_author'),
    translationDate: text('translation_date'),
    discussion: text('discussion'),
    embedding: vector('embedding', { dimensions: 1536 }),
    ...auditAtFields,
    ...auditByFields,
  },
  (table) => ({
    embeddingIndex: index('embeddingIndex').using('hnsw', table.embedding.op('vector_cosine_ops')),
  }),
);

export type ReadGlossary = typeof glossariesTable.$inferSelect;
export type CreateGlossary = typeof glossariesTable.$inferInsert;
export type UpdateGlossary = Partial<CreateGlossary>;
