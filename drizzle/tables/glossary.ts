import { sql } from 'drizzle-orm';
import { index, integer, json, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { type Lang } from '~/utils/constants';

import { auditAtFields, auditByFields } from '../audit';
import { langEnum } from './enums';

export const glossariesTable = pgTable(
  'glossaries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    glossary: text('glossary').notNull(),
    phonetic: text('phonetic'),
    // LEGACY: a bookmark counter, +1/-1 per click. Bookmarking was removed (2026-11-06; on prod
    // the counter was 0 on every term). Neither read nor written; kept until the legacy purge
    // (docs/plans/legacy-purge.md). Do not delete it from the definition (see below).
    legacySubscribers: integer('subscribers').default(0),
    author: text('author'),
    cbetaFrequency: text('cbeta_frequency'),
    // LEGACY: the translations as a JSON array, before they moved to `glossary_translations`
    // (docs/plans/glossary-refactor.md). Neither read nor written by the app. The data stays
    // until the legacy purge (docs/plans/legacy-purge.md). Renamed on the code side only, so
    // nothing uses it by accident and the relation can be called `translations`. Do not
    // delete this column from the definition: `drizzle-kit generate` would then write a
    // DROP COLUMN, which the next deploy would run.
    legacyTranslations: json('translations')
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

// One row per translation of a term. Replaces the `glossaries.translations` JSON array,
// which stays in place until the code has moved over (see docs/plans/glossary-refactor.md).
export const glossaryTranslationsTable = pgTable(
  'glossary_translations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    glossaryId: uuid('glossary_id')
      .references(() => glossariesTable.id, { onDelete: 'cascade' })
      .notNull(),
    // Display order within the term (the JSON array's order is meaningful).
    position: integer('position').notNull(),
    language: langEnum('language').notNull().default('english'),
    // The rendering (JSON `glossary`).
    term: text('term').notNull(),
    // JSON `sutraName`; '佛教常用詞' is the sentinel for "no source".
    sourceName: text('source_name').notNull().default('佛教常用詞'),
    volume: text('volume').notNull().default('-'),
    // JSON `originSutraText` / `targetSutraText`.
    sourceText: text('source_text'),
    targetText: text('target_text'),
    author: text('author'),
    // Why this rendering was chosen.
    rationale: text('rationale'),
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
