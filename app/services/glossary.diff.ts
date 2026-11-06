// What it takes to turn a term's stored translations into a new list of them, matched by id.
// Pure and client-safe.
//
// GlossaryStore.update takes the whole list a term should end up with and writes only the
// difference from the stored rows, which is what this works out:
//   - a translation without an id is new: inserted;
//   - one with a stored id is that translation: updated, if its content or place changed;
//   - a stored translation the list leaves out is removed.
// An id the term does not have, or one given twice, is refused rather than guessed at: either
// would mean the list was built from something other than this term's translations (typically
// a form opened before someone else removed that translation).
import { type GlossaryTranslation } from './glossary.types';

export type StoredTranslation = GlossaryTranslation & { id: string };

export const isStored = (translation: GlossaryTranslation): translation is StoredTranslation => Boolean(translation.id);

// The list does not fit the term's stored translations. A conflict, not a server fault.
export class TranslationListError extends Error {
  name = 'TranslationListError';
}

export type TranslationDiff = {
  insert: { position: number; translation: GlossaryTranslation }[];
  // contentChanged false: only the position moved, so who/when last edited it stays as it is.
  update: { id: string; position: number; translation: GlossaryTranslation; contentChanged: boolean }[];
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
    if (!before) throw new TranslationListError(`Translation ${id} is not one of this term's translations`);
    if (kept.has(id)) throw new TranslationListError(`Translation ${id} is in the list twice`);
    kept.add(id);
    const contentChanged = !sameContent(before.translation, translation);
    if (before.position !== position || contentChanged) {
      diff.update.push({ id, position, translation, contentChanged });
    }
  });

  diff.remove = stored.filter((translation) => !kept.has(translation.id)).map((translation) => translation.id);
  return diff;
}

// Whether saving `next` over the stored translations adds or removes one, which takes the
// Maintain ability; Update may only edit the translations that exist. Matched by id, so
// replacing one translation with another counts even though the list keeps its length.
// Throws TranslationListError as diffTranslations does.
export function addsOrRemoves(stored: readonly StoredTranslation[], next: readonly GlossaryTranslation[]): boolean {
  const { insert, remove } = diffTranslations(stored, next);
  return insert.length > 0 || remove.length > 0;
}
