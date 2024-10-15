import { pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { auditAtFields, auditByFields } from '../audit';

export const glossariesTable = pgTable('glossaries', {
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
  searchId: text('search_id').notNull(),
  ...auditAtFields,
  ...auditByFields,
});

export type ReadGlossary = typeof glossariesTable.$inferSelect;
export type CreateGlossary = typeof glossariesTable.$inferInsert;
export type UpdateGlossary = Partial<CreateGlossary>;
