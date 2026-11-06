// Client-safe merging of glossary translation lists.
//
// Imported by the browser preview panel as well as the server-side importer, so — like
// glossary.parse.ts — it must never reach into `~/lib/db.server`, Algolia or OpenAI.
//
// GlossaryStore.update takes the whole list a term should end up with, so an import that sent
// only the file's rows would silently drop every translation the file didn't mention. Import
// files are expected to carry one source at a time, so incoming rows are added to what is
// already stored, and an import never removes a translation.
//
// Only an id makes a row an update: a file row whose TranslationUUID names one of the term's
// stored translations is that translation, and the file's content replaces the stored content
// in place (a correction re-imported). Every other row is appended. Content is never used to
// match: near-identical translations are legitimate (one sutra and volume can attest the same
// term in several passages), so any content rule would sometimes merge two records or split
// one. A row identical to a stored translation, or to an earlier row of the file, is still
// appended but flagged as a duplicate, so the preview shows an accidental re-import of an
// id-less file before it is written.

// The fields compared when deciding whether two translations are the same. Structurally
// satisfied by both the stored translation shape and the preview's display shape. `id` is the
// stored translation's id, or on an incoming row the file's TranslationUUID.
export type MergeableTranslation = {
  id?: string | null;
  glossary: string;
  sourceName: string;
  volume: string;
  sourceText?: string | null;
  targetText?: string | null;
  author?: string | null;
  rationale?: string | null;
  updatedBy?: string;
  updatedAt?: string;
};

// kept: stored and unchanged. updated: stored, and the file (by TranslationUUID) changes it.
// new: added by the file.
export type TranslationStatus = 'kept' | 'updated' | 'new';

export type MergedTranslation<T> = {
  translation: T;
  status: TranslationStatus;
  // New, and identical (sameAttestation) to a stored translation or an earlier row of the file.
  duplicate?: boolean;
};

// What a translation says, normalised (trimmed, lowercased): the term, the source, the volume,
// both passages and the author. Imports no longer match by it (see the top of this file); data
// migration 08 used it to report duplicates. The rationale is not part of it.
// Anything less would merge separate attestations — several passages from one volume can use
// the same English term — and merging them would destroy the record of one of them.
//
// updatedAt/updatedBy are excluded because they always differ on re-import and would make
// every unchanged row look like a new one.
export function translationKey(t: MergeableTranslation): string {
  return [t.glossary, t.sourceName, t.volume, t.sourceText, t.targetText, t.author]
    .map((field) => (field ?? '').trim().toLowerCase())
    .join('␟');
}

// What a file row says about a translation. An undefined field is one the file does not carry
// (Rationale in a file without that column), which leaves the stored value alone; null or ''
// is a blank cell, which clears it.
const FILE_CONTENT = [
  'glossary',
  'sourceName',
  'volume',
  'sourceText',
  'targetText',
  'author',
  'rationale',
] as const satisfies readonly (keyof MergeableTranslation)[];

const blankAsNull = (value: string | null | undefined) => (value === '' || value === undefined ? null : value);

// What makes two translations the same record, for the duplicate flag: every field the file
// carries except the rationale, compared exactly (no trimming or lowercasing); a blank cell and
// an empty stored value are equal.
const ATTESTATION = ['glossary', 'sourceName', 'volume', 'sourceText', 'targetText', 'author'] as const;

export const sameAttestation = (a: MergeableTranslation, b: MergeableTranslation): boolean =>
  ATTESTATION.every((field) => blankAsNull(a[field]) === blankAsNull(b[field]));

// The stored translation with the file row's content and who imported it. Its id, language and
// anything else the file cannot carry stay as stored.
function applyFileRow<T extends MergeableTranslation>(stored: T, row: T): { translation: T; changed: boolean } {
  const translation = { ...stored };
  let changed = false;
  for (const field of FILE_CONTENT) {
    if (row[field] === undefined) continue;
    if (blankAsNull(row[field]) !== blankAsNull(stored[field])) changed = true;
    Object.assign(translation, { [field]: row[field] });
  }
  if (changed) Object.assign(translation, { updatedBy: row.updatedBy, updatedAt: row.updatedAt });
  return { translation: changed ? translation : stored, changed };
}

// Adds incoming translations to the stored ones.
//
// Stored order is preserved so entries don't reshuffle on every import, and every stored
// translation stays (an import removes nothing). A file row whose id names a stored
// translation updates it in place; the first such row wins if the file names one twice. Every
// other row is appended as new, without the file's id (an id that names none of this term's
// translations is not reused), and flagged if it duplicates a stored translation or an earlier
// row.
export function mergeTranslationsWithStatus<T extends MergeableTranslation>(
  existing: readonly T[] | null | undefined,
  incoming: readonly T[] | null | undefined,
): MergedTranslation<T>[] {
  const merged: MergedTranslation<T>[] = (existing ?? []).map((translation) => ({ translation, status: 'kept' }));
  const byId = new Map<string, number>();
  merged.forEach(({ translation }, index) => {
    if (translation.id) byId.set(translation.id, index);
  });

  const claimed = new Set<string>();
  const appended: T[] = [];
  for (const row of incoming ?? []) {
    const index = row.id && !claimed.has(row.id) ? byId.get(row.id) : undefined;
    if (index === undefined) {
      const { id, ...rest } = row;
      void id;
      appended.push(rest as T);
      continue;
    }
    claimed.add(row.id!);
    const { translation, changed } = applyFileRow(merged[index].translation, row);
    merged[index] = { translation, status: changed ? 'updated' : 'kept' };
  }

  for (const translation of appended) {
    const duplicate = merged.some((m) => sameAttestation(m.translation, translation));
    merged.push({ translation, status: 'new', duplicate });
  }

  return merged;
}

export function mergeTranslations<T extends MergeableTranslation>(
  existing: readonly T[] | null | undefined,
  incoming: readonly T[] | null | undefined,
): T[] {
  return mergeTranslationsWithStatus(existing, incoming).map((m) => m.translation);
}
