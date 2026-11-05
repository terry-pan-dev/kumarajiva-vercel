// The shapes the glossary is read in, everywhere outside the storage layer: services, routes,
// components, import/export and search. Client-safe (types only).
//
// They are deliberately not derived from the `glossaries.translations` JSON column. That
// column is being replaced by the `glossary_translations` table
// (docs/plans/glossary-refactor.md); spelling the read shape out here is what lets storage
// change underneath while the rest of the app keeps reading the same fields.
//
// Field names are today's JSON names (`glossary` for the rendering, `sutraName`, …). Renaming
// them to the table's names is a later, separate step.
import { type ReadGlossary } from '~/drizzle/tables';
import { type Lang } from '~/utils/constants';

export type GlossaryTranslation = {
  // The translation's own id. Absent while translations are stored as JSON; always present
  // once they are rows.
  id?: string;
  // The rendering.
  glossary: string;
  language: Lang;
  sutraName: string;
  volume: string;
  originSutraText?: string | null;
  targetSutraText?: string | null;
  author?: string | null;
  partOfSpeech?: string | null;
  phonetic?: string | null;
  // Why this rendering was chosen. Not stored until translations are rows.
  rationale?: string | null;
  updatedBy: string;
  // ISO timestamp.
  updatedAt: string;
};

// A term without its translations.
export type GlossaryTerm = Omit<ReadGlossary, 'translations'>;

// A term with its translations, in display order.
export type GlossaryEntry = GlossaryTerm & { translations: GlossaryTranslation[] };

// Accepted by the pure helpers (export, search record, inspector checks) so they take both an
// entry and a raw row, whose JSON column can be null.
export type WithTranslations<T> = T & { translations?: readonly GlossaryTranslation[] | null };
