// Client-safe merging of glossary translation lists.
//
// Imported by the browser preview panel as well as the server-side importer, so — like
// glossary.parse.ts — it must never reach into `~/lib/db.server`, Algolia or OpenAI.
//
// Translations live in a single JSON column, so an import that wrote only the file's rows
// would silently drop every translation the file didn't mention. Import files are expected
// to carry one source at a time, so incoming rows are added to what is already stored.
//
// Nothing distinct is ever collapsed. Two translations are the same only when every field
// matches; a single sutra and volume can attest the same term several times, and those are
// separate records of separate passages even when they settle on the same English wording.
// The only collapsing that happens is of rows that are identical in every field, which is
// what keeps re-importing the same file from doubling every list.

// The fields compared when deciding whether two translations are the same. Structurally
// satisfied by both the stored translation shape and the preview's display shape.
export type MergeableTranslation = {
  glossary: string;
  sutraName: string;
  volume: string;
  originSutraText?: string | null;
  targetSutraText?: string | null;
  author?: string | null;
};

// 'updated' is gone: with whole-translation identity there is nothing to update in place.
// A changed field makes a separate translation, which is reported as new.
export type TranslationStatus = 'kept' | 'new';

export type MergedTranslation<T> = {
  translation: T;
  status: TranslationStatus;
};

// Identity of a translation: everything the file can carry about it. Two translations match
// only when the term, the source, the volume, both passages and the author are all the same.
// Anything less would merge separate attestations — several passages from one volume can use
// the same English term — and merging them would destroy the record of one of them.
//
// updatedAt/updatedBy are excluded because they always differ on re-import and would make
// every unchanged row look like a new one.
export function translationKey(t: MergeableTranslation): string {
  return [t.glossary, t.sutraName, t.volume, t.originSutraText, t.targetSutraText, t.author]
    .map((field) => (field ?? '').trim().toLowerCase())
    .join('␟');
}

// Adds incoming translations to the stored ones.
//
// Stored order is preserved so entries don't reshuffle on every import. A stored translation
// the file repeats exactly is kept as it is; everything else in the file is appended. Rows
// identical in every field collapse to one, which is what makes a repeated import of the same
// file idempotent — and is the only case in which two translations ever become one.
//
// Note that a corrected translation arrives as a new one: with no per-translation id there is
// no way to tell "this passage, fixed" from "another passage", and guessing wrong would erase
// an attestation. Superseded translations are removed by hand in the glossary edit form.
export function mergeTranslationsWithStatus<T extends MergeableTranslation>(
  existing: readonly T[] | null | undefined,
  incoming: readonly T[] | null | undefined,
): MergedTranslation<T>[] {
  const incomingByKey = new Map<string, T>();
  for (const t of incoming ?? []) {
    const key = translationKey(t);
    if (!incomingByKey.has(key)) incomingByKey.set(key, t);
  }

  const merged: MergedTranslation<T>[] = [];
  const seen = new Set<string>();

  for (const stored of existing ?? []) {
    const key = translationKey(stored);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({ translation: stored, status: 'kept' });
  }

  for (const [key, translation] of incomingByKey) {
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({ translation, status: 'new' });
  }

  return merged;
}

export function mergeTranslations<T extends MergeableTranslation>(
  existing: readonly T[] | null | undefined,
  incoming: readonly T[] | null | undefined,
): T[] {
  return mergeTranslationsWithStatus(existing, incoming).map((m) => m.translation);
}
