// Turns Algolia paragraph hits into search results, from rows already read from the database.
// Kept free of the database and Algolia so the rules below can be unit-tested on fixtures;
// search.server.ts does the reading and calls this.
//
// A hit only names a row. Everything a result shows — where the paragraph sits (work, document,
// section) and its aligned paragraphs in the work's other documents — comes from the rows.
import { type ReadParagraphNew } from '~/drizzle/tables';
import { type Lang } from '~/utils/constants';

export type SearchDocument = { id: string; title: string; language: Lang; key: string | null };

// A hit's row with its location, as DbParagraphsNew.findByIdsWithRelations returns it.
export type HitRow = ReadParagraphNew & {
  section: { id: string; title: string | null; order: number };
  document: SearchDocument & { workId: string; work: { title: string } };
};

// A paragraph that could be aligned with a hit: same work, same passage_key.
export type AlignedCandidate = {
  id: string;
  content: string;
  passageKey: string | null;
  order: number;
  document: SearchDocument & { workId: string };
};

export type AlignedParagraph = { id: string; content: string; document: SearchDocument };

export type ParagraphSearchResult = ReadParagraphNew & {
  work: { title: string };
  document: SearchDocument;
  section: { id: string; title: string | null; order: number };
  // The same passage in the work's other documents — the hit's translation(s), its source, or
  // reference renderings — in document-title order.
  aligned: AlignedParagraph[];
};

// Parked rows (order < 0) are hidden from every reader view, so they are hidden from search too.
const isParked = (row: { order: number }) => row.order < 0;

const alignmentKey = (workId: string, passageKey: string) => `${workId}␟${passageKey}`;

export function assembleParagraphSearchResults({
  hitIds,
  rows,
  candidates,
  limit,
}: {
  hitIds: string[];
  rows: HitRow[];
  candidates: AlignedCandidate[];
  limit: number;
}): ParagraphSearchResult[] {
  const rowById = new Map(rows.map((row) => [row.id, row]));

  const candidatesByKey = new Map<string, AlignedCandidate[]>();
  for (const candidate of candidates) {
    if (!candidate.passageKey || isParked(candidate)) continue;
    const key = alignmentKey(candidate.document.workId, candidate.passageKey);
    const list = candidatesByKey.get(key) ?? [];
    list.push(candidate);
    candidatesByKey.set(key, list);
  }

  const results: ParagraphSearchResult[] = [];
  const seen = new Set<string>();

  // Algolia's order is the relevance order, so results follow the hits, not the rows. A hit
  // that resolves to no row (a stale record) or to a parked row is skipped; an id the index
  // holds twice is shown once.
  for (const id of hitIds) {
    if (results.length >= limit) break;
    if (seen.has(id)) continue;
    const row = rowById.get(id);
    if (!row || isParked(row)) continue;
    seen.add(id);

    const { section, document, ...paragraph } = row;
    const sameKey = row.passageKey ? (candidatesByKey.get(alignmentKey(document.workId, row.passageKey)) ?? []) : [];
    // Only other documents: a second row with the same key in the hit's own document is a
    // duplicate, not a counterpart.
    const aligned = sameKey
      .filter((c) => c.document.id !== document.id)
      .sort((a, b) => a.document.title.localeCompare(b.document.title) || a.order - b.order)
      .map((c) => ({ id: c.id, content: c.content, document: toSearchDocument(c.document) }));

    results.push({
      ...paragraph,
      work: { title: document.work.title },
      document: toSearchDocument(document),
      section: { id: section.id, title: section.title, order: section.order },
      aligned,
    });
  }

  return results;
}

const toSearchDocument = ({ id, title, language, key }: SearchDocument): SearchDocument => ({
  id,
  title,
  language,
  key,
});
