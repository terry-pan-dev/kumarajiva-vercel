// Pairing and sanity checks for raw paragraphs_new rows, shared by the data-management pages
// that show them side by side: the Paragraphs page (a project's source and translation section)
// and the Document Inspector's compare view.
//
// Client-safe — no database, no Algolia — so the routes can use it in components and it can be
// unit-tested on plain fixtures. Generic over the row shape: only the fields below are read.

export type PairableRow = { id: string; order: number; passageKey: string | null; content: string };

// Parked rows (negative order) are hidden from every reader view.
export const isParked = (row: Pick<PairableRow, 'order'>) => row.order < 0;

// How often each content string occurs among the rows. Content that occurs more than once in a
// document is the main sign of a doubled import.
export function contentCounts(rows: Iterable<Pick<PairableRow, 'content'>>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.content, (counts.get(row.content) ?? 0) + 1);
  return counts;
}

// Passage keys used by more than one of the rows. A key identifies one passage, so within one
// document a repeated key means two rows claim the same passage.
export function duplicatePassageKeys(rows: Iterable<Pick<PairableRow, 'passageKey'>>): Set<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const { passageKey } of rows) {
    if (!passageKey) continue;
    if (seen.has(passageKey)) duplicates.add(passageKey);
    seen.add(passageKey);
  }
  return duplicates;
}

// The first row for each passage key — what a reader view pairs a source paragraph with.
export function firstByPassageKey<T extends PairableRow>(rows: T[]): Map<string, T> {
  const byKey = new Map<string, T>();
  for (const row of rows) {
    if (row.passageKey && !byKey.has(row.passageKey)) byKey.set(row.passageKey, row);
  }
  return byKey;
}

// The rows of `others` that pair with none of `rows`: no passage key, or a key `rows` lacks.
export function unmatchedRows<T extends PairableRow>(rows: PairableRow[], others: T[]): T[] {
  const keys = new Set(rows.map((r) => r.passageKey).filter(Boolean));
  return others.filter((r) => !r.passageKey || !keys.has(r.passageKey));
}

// Where a passage appended to a section goes: after every row on either side (parked rows aside),
// keyed the way the import keys a row that has no passage_key.
export function nextPassage(
  rows: Iterable<Pick<PairableRow, 'order'>>,
  passageKeyPrefix: string,
  sectionOrder: number,
): { order: number; passageKey: string } {
  let last = 0;
  for (const row of rows) if (!isParked(row) && row.order > last) last = row.order;
  const order = last + 1;
  return { order, passageKey: `${passageKeyPrefix}.${sectionOrder}.${order}` };
}

export type ParagraphPair<T> = {
  // Stable React key.
  key: string;
  // Null for an orphan: a translation row that pairs with no source row.
  source: T | null;
  // Every translation row with the source's passage key — normally one, none when untranslated.
  // More than one means rows compete for the same passage.
  targets: T[];
};

// Pairs a source section's rows with its translation section's rows by passage key, the same
// pairing the translation editor uses. Orphan translation rows are not dropped: each becomes a
// pair of its own, placed by its order among the source rows, so corruption shows where it sits.
export function pairByPassageKey<T extends PairableRow>(sourceRows: T[], targetRows: T[]): ParagraphPair<T>[] {
  const targetsByKey = new Map<string, T[]>();
  for (const row of targetRows) {
    if (!row.passageKey) continue;
    const list = targetsByKey.get(row.passageKey) ?? [];
    list.push(row);
    targetsByKey.set(row.passageKey, list);
  }

  // A source key repeated in the source section pairs its translations with the first source
  // row only, so a translation is never shown twice.
  const claimed = new Set<string>();
  const paired = sourceRows.map((source) => {
    const key = source.passageKey;
    const targets = key && !claimed.has(key) ? (targetsByKey.get(key) ?? []) : [];
    if (key) claimed.add(key);
    return { key: source.id, source, targets, order: source.order };
  });
  const orphans = unmatchedRows(sourceRows, targetRows).map((target) => ({
    key: target.id,
    source: null,
    targets: [target],
    order: target.order,
  }));

  // Stable merge by order; on a tie the source row comes first.
  return [...paired, ...orphans]
    .map((pair, index) => ({ pair, index }))
    .sort((a, b) => a.pair.order - b.pair.order || a.index - b.index)
    .map(({ pair: { key, source, targets } }) => ({ key, source, targets }));
}

export type RowProblem = 'parked' | 'no-passage-key' | 'duplicate-passage-key' | 'duplicate-content';

// What is wrong with one row, judged against the other rows of its own document.
export function rowProblems(
  row: PairableRow,
  context: { contentCounts: Map<string, number>; duplicateKeys: Set<string> },
): RowProblem[] {
  const problems: RowProblem[] = [];
  if (isParked(row)) problems.push('parked');
  if (!row.passageKey) problems.push('no-passage-key');
  else if (context.duplicateKeys.has(row.passageKey)) problems.push('duplicate-passage-key');
  if ((context.contentCounts.get(row.content) ?? 0) > 1) problems.push('duplicate-content');
  return problems;
}
