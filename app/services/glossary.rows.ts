// Maps `glossary_translations` rows to the read shape (GlossaryTranslation) and back. Pure: no
// database access, so GlossaryStore's mapping is unit-tested directly.
//
// Fields with the same name on both sides map straight across. The rest:
//
//   row            read shape
//   term           glossary
//   metadata       partOfSpeech, phonetic (stored only when non-empty)
//   updatedAt      updatedAt, as an ISO string
//   updatedBy      updatedBy
import { type CreateGlossaryTranslation, type ReadGlossaryTranslation } from '~/drizzle/tables/glossary';

import { type StoredTranslation } from './glossary.diff';
import { type GlossaryTranslation } from './glossary.types';

// partOfSpeech and phonetic come back as null, not absent, when the row has none. The edit form
// posts '' for a field whose value is absent but keeps a null, and the diff tells '' from null:
// absent would make every save look like an edit of every translation.
export const toGlossaryTranslation = (row: ReadGlossaryTranslation): StoredTranslation => ({
  id: row.id,
  glossary: row.term,
  language: row.language,
  sourceName: row.sourceName,
  volume: row.volume,
  sourceText: row.sourceText,
  targetText: row.targetText,
  author: row.author,
  partOfSpeech: row.metadata?.partOfSpeech ?? null,
  phonetic: row.metadata?.phonetic ?? null,
  rationale: row.rationale,
  updatedBy: row.updatedBy,
  updatedAt: row.updatedAt.toISOString(),
});

const nonEmpty = (value: string | null | undefined): value is string => Boolean(value?.trim());

// The content columns of a row for `translation`: everything the diff compares
// (sameContent in glossary.diff.ts). Audit columns and position are the store's to set.
export const translationContent = (translation: GlossaryTranslation) => {
  const metadata: Record<string, string> = {};
  if (nonEmpty(translation.partOfSpeech)) metadata.partOfSpeech = translation.partOfSpeech;
  if (nonEmpty(translation.phonetic)) metadata.phonetic = translation.phonetic;
  return {
    language: translation.language,
    term: translation.glossary,
    sourceName: translation.sourceName,
    volume: translation.volume,
    sourceText: translation.sourceText ?? null,
    targetText: translation.targetText ?? null,
    author: translation.author ?? null,
    rationale: translation.rationale ?? null,
    metadata: Object.keys(metadata).length > 0 ? metadata : null,
  } satisfies Partial<CreateGlossaryTranslation>;
};

// A new row for `translation` at `position` of term `glossaryId`. Created and last edited by
// whoever the translation says last edited it; the times are the database's (now).
export const newTranslationRow = (
  glossaryId: string,
  position: number,
  translation: GlossaryTranslation,
): CreateGlossaryTranslation => ({
  glossaryId,
  position,
  ...translationContent(translation),
  createdBy: translation.updatedBy,
  updatedBy: translation.updatedBy,
});

// Rows grouped by term, each group in position order. Terms with no rows are absent.
export const groupByGlossaryId = (rows: readonly ReadGlossaryTranslation[]): Map<string, StoredTranslation[]> => {
  const byTerm = new Map<string, ReadGlossaryTranslation[]>();
  for (const row of rows) {
    const group = byTerm.get(row.glossaryId);
    if (group) group.push(row);
    else byTerm.set(row.glossaryId, [row]);
  }
  return new Map(
    [...byTerm].map(([glossaryId, group]) => [
      glossaryId,
      [...group].sort((a, b) => a.position - b.position).map(toGlossaryTranslation),
    ]),
  );
};
