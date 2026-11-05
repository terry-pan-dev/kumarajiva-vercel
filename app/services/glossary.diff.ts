// What it takes to turn a term's stored translations into a new list of them, matched by id.
// Pure and client-safe.
//
// GlossaryStore.update takes the whole list a term should end up with. While translations are
// one JSON column that list is simply written; once they are rows (docs/plans/glossary-refactor.md,
// PR 4) the store writes only the difference, which is what this works out:
//   - a translation without an id is new: inserted;
//   - one with a stored id is that translation: updated, if its content or place changed;
//   - a stored translation the list leaves out is removed.
// An id the term does not have, or one given twice, is refused rather than guessed at: either
// would mean the list was built from something other than this term's translations.
import { type GlossaryTranslation } from './glossary.types';

export type StoredTranslation = GlossaryTranslation & { id: string };

export type TranslationDiff = {
  insert: { position: number; translation: GlossaryTranslation }[];
  update: { id: string; position: number; translation: GlossaryTranslation }[];
  remove: string[];
};

// What a translation says, as against who last touched it. Two translations with the same
// content are unchanged whatever their updatedBy/updatedAt, so an edit that leaves one alone
// leaves its audit alone too.
const CONTENT_FIELDS = [
  'glossary',
  'language',
  'sutraName',
  'volume',
  'originSutraText',
  'targetSutraText',
  'author',
  'partOfSpeech',
  'phonetic',
  'rationale',
] as const satisfies readonly (keyof GlossaryTranslation)[];

// Null and absent are the same: both are "not given".
export const sameContent = (a: GlossaryTranslation, b: GlossaryTranslation): boolean =>
  CONTENT_FIELDS.every((field) => (a[field] ?? null) === (b[field] ?? null));

// `stored` in display order; a translation's position is its index in the list it is in, so
// positions come out numbered 0, 1, 2, … whatever gaps the stored ones had.
export function diffTranslations(
  stored: readonly StoredTranslation[],
  next: readonly GlossaryTranslation[],
): TranslationDiff {
  const storedById = new Map(stored.map((translation, position) => [translation.id, { translation, position }]));
  const kept = new Set<string>();
  const diff: TranslationDiff = { insert: [], update: [], remove: [] };

  next.forEach((translation, position) => {
    const { id } = translation;
    if (!id) {
      diff.insert.push({ position, translation });
      return;
    }
    const before = storedById.get(id);
    if (!before) throw new Error(`Translation ${id} is not one of this term's translations`);
    if (kept.has(id)) throw new Error(`Translation ${id} is in the list twice`);
    kept.add(id);
    if (before.position !== position || !sameContent(before.translation, translation)) {
      diff.update.push({ id, position, translation });
    }
  });

  diff.remove = stored.filter((translation) => !kept.has(translation.id)).map((translation) => translation.id);
  return diff;
}
