// Pure part of data migration 08: turns each term's `glossaries.translations` JSON array
// into `glossary_translations` rows, and checks rows read back from the database against
// the rows that were planned. No database access here, so it is unit-tested directly.
//
// The copy is faithful: values are copied as they are (no trimming, '' stays ''), the
// array order becomes `position`, and duplicates are kept and only reported. The few
// places where a value has to be made up are reported as issues:
//
// - a missing `sutraName` / `volume` gets the same defaults the forms use;
// - a missing or unparsable `updatedAt`, or a missing `updatedBy`, falls back to the term's;
// - `partOfSpeech` / `phonetic` go into `metadata`, and only when non-empty (the create
//   form writes '' for both, which carries nothing).
//
// Anything that cannot be copied without losing or inventing data blocks the migration:
// a `translations` value that is not an array, an element that is not an object, a missing
// rendering, a language outside the `lang` enum (or Chinese), or a field this script does
// not know about.

import { type ReadGlossaryTranslation } from '~/drizzle/tables/glossary';
import { translationKey } from '~/services/glossary.merge';
import { type Lang, LANG_VALUES } from '~/utils/constants';

export const DEFAULT_SOURCE_NAME = '佛教常用詞';
export const DEFAULT_VOLUME = '-';

const KNOWN_FIELDS = new Set([
  'glossary',
  'language',
  'sutraName',
  'volume',
  'originSutraText',
  'targetSutraText',
  'author',
  'partOfSpeech',
  'phonetic',
  'updatedBy',
  'updatedAt',
]);

const TRANSLATION_LANGUAGES = new Set<string>(LANG_VALUES.filter((l) => l !== 'chinese'));

export type SourceTerm = {
  id: string;
  glossary: string;
  translations: unknown;
  updatedAt: Date;
  updatedBy: string;
  deletedAt: Date | null;
};

export type BlockingIssueKind =
  | 'translations-not-array'
  | 'element-not-object'
  | 'missing-rendering'
  | 'invalid-language'
  | 'unknown-field';

export type WarningIssueKind = 'translations-null' | 'missing-source-name' | 'missing-volume' | 'audit-from-term';

export type IssueKind = BlockingIssueKind | WarningIssueKind;

const BLOCKING: ReadonlySet<IssueKind> = new Set<BlockingIssueKind>([
  'translations-not-array',
  'element-not-object',
  'missing-rendering',
  'invalid-language',
  'unknown-field',
]);

export const isBlocking = (kind: IssueKind) => BLOCKING.has(kind);

export type Issue = {
  kind: IssueKind;
  glossaryId: string;
  term: string;
  // Array index of the translation; null for term-level issues.
  position: number | null;
  detail?: string;
};

// Translations of one term that share the import's identity key (translationKey()).
export type DuplicateGroup = {
  glossaryId: string;
  term: string;
  positions: number[];
};

// A planned row is a stored row without the generated id and the unused deletedAt, so it can
// be inserted as it is and compared field by field with what the database returns.
export type PlannedRow = Omit<ReadGlossaryTranslation, 'id' | 'deletedAt'>;

export type TermPlan = {
  rows: PlannedRow[];
  issues: Issue[];
  duplicates: DuplicateGroup[];
};

const isPresent = (value: unknown): value is string => typeof value === 'string';
const isNonEmpty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function planTerm(term: SourceTerm): TermPlan {
  const rows: PlannedRow[] = [];
  const issues: Issue[] = [];
  const issue = (kind: IssueKind, position: number | null, detail?: string) =>
    issues.push({ kind, glossaryId: term.id, term: term.glossary, position, detail });

  if (term.translations === null || term.translations === undefined) {
    issue('translations-null', null);
    return { rows, issues, duplicates: [] };
  }
  if (!Array.isArray(term.translations)) {
    issue('translations-not-array', null, typeof term.translations);
    return { rows, issues, duplicates: [] };
  }

  term.translations.forEach((element: unknown, position) => {
    if (typeof element !== 'object' || element === null || Array.isArray(element)) {
      issue('element-not-object', position, JSON.stringify(element));
      return;
    }
    const t = element as Record<string, unknown>;

    const unknown = Object.keys(t).filter((key) => !KNOWN_FIELDS.has(key));
    if (unknown.length > 0) issue('unknown-field', position, unknown.join(', '));

    if (!isPresent(t.glossary) || t.glossary.length === 0) {
      issue('missing-rendering', position);
      return;
    }
    if (typeof t.language !== 'string' || !TRANSLATION_LANGUAGES.has(t.language)) {
      issue('invalid-language', position, String(t.language));
      return;
    }

    if (!isPresent(t.sutraName)) issue('missing-source-name', position);
    if (!isPresent(t.volume)) issue('missing-volume', position);

    const updatedAt = parseDate(t.updatedAt);
    const updatedBy = isNonEmpty(t.updatedBy) ? t.updatedBy : null;
    if (!updatedAt || !updatedBy) {
      issue(
        'audit-from-term',
        position,
        [!updatedAt && 'updatedAt', !updatedBy && 'updatedBy'].filter(Boolean).join(', '),
      );
    }

    const metadata: Record<string, string> = {};
    if (isNonEmpty(t.partOfSpeech)) metadata.partOfSpeech = t.partOfSpeech;
    if (isNonEmpty(t.phonetic)) metadata.phonetic = t.phonetic;

    const at = updatedAt ?? term.updatedAt;
    const by = updatedBy ?? term.updatedBy;

    rows.push({
      glossaryId: term.id,
      position,
      language: t.language as Lang,
      term: t.glossary,
      sourceName: isPresent(t.sutraName) ? t.sutraName : DEFAULT_SOURCE_NAME,
      volume: isPresent(t.volume) ? t.volume : DEFAULT_VOLUME,
      sourceText: isPresent(t.originSutraText) ? t.originSutraText : null,
      targetText: isPresent(t.targetSutraText) ? t.targetSutraText : null,
      author: isPresent(t.author) ? t.author : null,
      rationale: null,
      metadata: Object.keys(metadata).length > 0 ? metadata : null,
      createdAt: at,
      updatedAt: at,
      createdBy: by,
      updatedBy: by,
    });
  });

  return { rows, issues, duplicates: findDuplicates(term, rows) };
}

function findDuplicates(term: SourceTerm, rows: PlannedRow[]): DuplicateGroup[] {
  const byKey = new Map<string, number[]>();
  for (const row of rows) {
    const key = translationKey({
      glossary: row.term,
      sutraName: row.sourceName,
      volume: row.volume,
      originSutraText: row.sourceText,
      targetSutraText: row.targetText,
      author: row.author,
    });
    byKey.set(key, [...(byKey.get(key) ?? []), row.position]);
  }
  return [...byKey.values()]
    .filter((positions) => positions.length > 1)
    .map((positions) => ({ glossaryId: term.id, term: term.glossary, positions }));
}

export type MigrationPlan = TermPlan & {
  terms: number;
  trashedTerms: number;
  // Sum of the array lengths, i.e. the number of rows a complete copy must produce.
  elements: number;
};

export function planMigration(terms: readonly SourceTerm[]): MigrationPlan {
  const plan: MigrationPlan = { rows: [], issues: [], duplicates: [], terms: 0, trashedTerms: 0, elements: 0 };
  for (const term of terms) {
    const { rows, issues, duplicates } = planTerm(term);
    plan.rows.push(...rows);
    plan.issues.push(...issues);
    plan.duplicates.push(...duplicates);
    plan.terms += 1;
    if (term.deletedAt) plan.trashedTerms += 1;
    if (Array.isArray(term.translations)) plan.elements += term.translations.length;
  }
  return plan;
}

// The fields compared after the copy. id, rationale and deletedAt are not planned values.
const COMPARED_FIELDS = [
  'language',
  'term',
  'sourceName',
  'volume',
  'sourceText',
  'targetText',
  'author',
  'metadata',
  'createdAt',
  'updatedAt',
  'createdBy',
  'updatedBy',
] as const;

function sameValue(a: unknown, b: unknown): boolean {
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }
  if (typeof a === 'object' || typeof b === 'object') return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  return (a ?? null) === (b ?? null);
}

export type VerifyMismatch =
  | { kind: 'missing'; glossaryId: string; position: number }
  | { kind: 'unexpected'; glossaryId: string; position: number }
  | { kind: 'different'; glossaryId: string; position: number; fields: string[] };

// Compares the rows read back from the table with the planned rows, matched on
// (glossaryId, position). An empty result means the copy is complete and exact.
export function verifyRows(
  planned: readonly PlannedRow[],
  stored: readonly Pick<ReadGlossaryTranslation, 'glossaryId' | 'position' | (typeof COMPARED_FIELDS)[number]>[],
): VerifyMismatch[] {
  const key = (glossaryId: string, position: number) => `${glossaryId}#${position}`;
  const storedByKey = new Map<string, (typeof stored)[number]>();
  const mismatches: VerifyMismatch[] = [];

  for (const row of stored) {
    const k = key(row.glossaryId, row.position);
    if (storedByKey.has(k)) mismatches.push({ kind: 'unexpected', glossaryId: row.glossaryId, position: row.position });
    else storedByKey.set(k, row);
  }

  const plannedKeys = new Set<string>();
  for (const row of planned) {
    const k = key(row.glossaryId, row.position);
    plannedKeys.add(k);
    const match = storedByKey.get(k);
    if (!match) {
      mismatches.push({ kind: 'missing', glossaryId: row.glossaryId, position: row.position });
      continue;
    }
    const fields = COMPARED_FIELDS.filter((field) => !sameValue(row[field], match[field]));
    if (fields.length > 0)
      mismatches.push({ kind: 'different', glossaryId: row.glossaryId, position: row.position, fields });
  }

  for (const [k, row] of storedByKey) {
    if (!plannedKeys.has(k))
      mismatches.push({ kind: 'unexpected', glossaryId: row.glossaryId, position: row.position });
  }
  return mismatches;
}
