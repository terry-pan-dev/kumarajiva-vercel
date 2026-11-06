// The shapes the glossary is read in, everywhere outside the storage layer: services, routes,
// components, import/export and search. Client-safe (types only).
//
// They are deliberately not derived from storage (the `glossary_translations` table, which
// replaced the `glossaries.translations` JSON column; docs/plans/glossary-refactor.md):
// spelling the read shape out here is what let storage change underneath while the rest of the
// app kept reading the same fields.
//
// Field names follow the table's (`sourceName`, `sourceText`, `targetText`; PR 8a), except
// `glossary` for the rendering, which the table calls `term` (PR 8b). File columns (SutraName,
// ChineseSutraText, …), the Algolia record and the assistant's `sutraTexts` keep their names.
import { type ReadGlossary } from '~/drizzle/tables';
import { type Lang } from '~/utils/constants';

export type GlossaryTranslation = {
  // The translation's own id. Always present on a stored translation; absent on a new one
  // (not saved yet), which is how GlossaryStore.update tells an addition from an edit.
  id?: string;
  // The rendering.
  glossary: string;
  language: Lang;
  sourceName: string;
  volume: string;
  sourceText?: string | null;
  targetText?: string | null;
  author?: string | null;
  partOfSpeech?: string | null;
  phonetic?: string | null;
  // Why this rendering was chosen. Stored, but no form or file carries it yet (PR 6).
  rationale?: string | null;
  updatedBy: string;
  // ISO timestamp.
  updatedAt: string;
};

// A term without its translations.
export type GlossaryTerm = ReadGlossary;

// A term with its translations, in display order.
export type GlossaryEntry = GlossaryTerm & { translations: GlossaryTranslation[] };

// Accepted by the pure helpers (export, search record, inspector checks). Translations are
// optional so they also take a term on its own.
export type WithTranslations<T> = T & { translations?: readonly GlossaryTranslation[] | null };
