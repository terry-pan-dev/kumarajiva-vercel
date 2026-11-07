import { sql } from 'drizzle-orm';
import { index, integer, json, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { auditAtFields, auditByFields } from '../audit';
import { langEnum } from './enums';

export const glossariesTable = pgTable(
  'glossaries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // The headword. File column ChineseTerm, Algolia record `glossary`. The column was
    // `glossary` until the column move (docs/plans/glossary-refactor.md, "Column move"): deploy
    // B renamed it to `source_term`, so it keeps its place in the table.
    sourceTerm: text('source_term').notNull(),
    phonetic: text('phonetic'),
    author: text('author'),
    cbetaFrequency: text('cbeta_frequency'),
    discussion: text('discussion'),
    searchId: text('search_id').default(sql`NULL`),
    ...auditAtFields,
    ...auditByFields,
  },
  (t) => ({
    // Named after the column's old name; it followed the rename.
    uniqueGlossaryIdx: uniqueIndex('unique_glossary_idx').on(t.sourceTerm),
  }),
);

export type ReadGlossary = typeof glossariesTable.$inferSelect;
export type CreateGlossary = typeof glossariesTable.$inferInsert;
export type UpdateGlossary = Partial<CreateGlossary>;

// One row per translation of a term. Replaced the `glossaries.translations` JSON array
// (copied by data script 08, column dropped in migration 0026; docs/plans/glossary-refactor.md).
export const glossaryTranslationsTable = pgTable(
  'glossary_translations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    glossaryId: uuid('glossary_id')
      .references(() => glossariesTable.id, { onDelete: 'cascade' })
      .notNull(),
    // Display order within the term.
    position: integer('position').notNull(),
    language: langEnum('language').notNull().default('english'),
    // The rendering.
    term: text('term').notNull(),
    // File column SutraName. No source is '' (forms and import since PR 9); older rows say
    // '佛教常用詞', the placeholder the forms used to fill in. Both stay.
    sourceName: text('source_name').notNull().default('佛教常用詞'),
    volume: text('volume').notNull().default('-'),
    // The passages the term appears in. File columns ChineseSutraText / EnglishSutraText.
    sourceText: text('source_text'),
    targetText: text('target_text'),
    author: text('author'),
    // Notes on this translation, e.g. why this rendering was chosen. Was `rationale` until
    // migration 0029. The term has its own glossaries.discussion.
    discussion: text('discussion'),
    // Rare per-translation fields (partOfSpeech, phonetic of the rendering); unused today.
    // The Chinese pinyin is the term-level glossaries.phonetic.
    metadata: json('metadata').$type<Record<string, string>>(),
    ...auditAtFields,
    ...auditByFields,
  },
  // No unique constraint: identity is decided in code (translationKey() in glossary.merge.ts),
  // because the data already holds legitimate near-duplicates.
  (t) => [index('glossary_translations_glossary_id_idx').on(t.glossaryId)],
);

export type ReadGlossaryTranslation = typeof glossaryTranslationsTable.$inferSelect;
export type CreateGlossaryTranslation = typeof glossaryTranslationsTable.$inferInsert;
