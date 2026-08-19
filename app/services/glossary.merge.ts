// Client-safe merging of glossary translation lists.
//
// Imported by the browser preview panel as well as the server-side importer, so — like
// glossary.parse.ts — it must never reach into `~/lib/db.server`, Algolia or OpenAI.
//
// Translations live in a single JSON column, so an import that wrote only the file's rows
// would silently drop every translation the file didn't mention. Import files are expected
// to carry one source at a time, so incoming rows are merged into what is already stored.

// The fields that identify a translation. Structurally satisfied by both the stored
// translation shape and the preview's display shape.
export type MergeableTranslation = {
  glossary: string;
  sutraName: string;
  volume: string;
  originSutraText?: string | null;
  targetSutraText?: string | null;
  author?: string | null;
};

export type TranslationStatus = 'kept' | 'updated' | 'new';

export type MergedTranslation<T> = {
  translation: T;
  status: TranslationStatus;
};

// Identity of a translation within one glossary entry: the English term plus its source.
// The same term translated from a different sutra or volume is a separate translation, not
// a revision of the existing one.
export function translationKey(t: MergeableTranslation): string {
  return [t.glossary, t.sutraName, t.volume].map((field) => (field ?? '').trim().toLowerCase()).join('␟');
}

// Compares only what the file can carry — updatedAt/updatedBy always differ on re-import
// and would make every unchanged row look like an edit.
function sameContent(a: MergeableTranslation, b: MergeableTranslation): boolean {
  const norm = (v?: string | null) => (v ?? '').trim();
  return (
    norm(a.originSutraText) === norm(b.originSutraText) &&
    norm(a.targetSutraText) === norm(b.targetSutraText) &&
    norm(a.author) === norm(b.author)
  );
}

// Merges incoming translations into the stored ones, keyed by translationKey.
//
// Stored order is preserved so entries don't reshuffle on every import; matched keys are
// replaced in place (incoming wins, so corrections still apply) and unmatched incoming
// translations are appended. Duplicate keys on either side collapse to one, which makes a
// repeated import of the same file idempotent.
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

    const replacement = incomingByKey.get(key);
    if (!replacement) {
      merged.push({ translation: stored, status: 'kept' });
    } else if (sameContent(stored, replacement)) {
      merged.push({ translation: replacement, status: 'kept' });
    } else {
      merged.push({ translation: replacement, status: 'updated' });
    }
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
