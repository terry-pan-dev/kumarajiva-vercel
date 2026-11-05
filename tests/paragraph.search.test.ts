import { describe, expect, it } from 'vitest';

import {
  type AlignedCandidate,
  assembleParagraphSearchResults,
  type HitRow,
  type SearchDocument,
} from '~/services/paragraph.search';

// ─── Fixtures ────────────────────────────────────────────────────────────────
// One work (Huayan) with a Chinese source and an English rendering, plus a second work whose
// passage keys deliberately collide with the first's.

type Doc = SearchDocument & { workId: string; workTitle: string };

const docs = {
  chinese: {
    id: 'zh',
    title: '大方廣佛華嚴經',
    language: 'chinese',
    key: 'chinese',
    workId: 'w1',
    workTitle: '華嚴經',
  },
  btts: { id: 'btts', title: 'Avatamsaka Sutra', language: 'english', key: 'btts', workId: 'w1', workTitle: '華嚴經' },
  other: { id: 'lz', title: '楞嚴經', language: 'chinese', key: null, workId: 'w2', workTitle: '楞嚴經' },
} satisfies Record<string, Doc>;

const date = new Date('2026-11-01T00:00:00Z');

function hitRow(id: string, doc: Doc, passageKey: string | null): HitRow {
  const { workId, workTitle, ...document } = doc;
  return {
    id,
    order: 1,
    passageKey,
    documentId: doc.id,
    sectionId: `${doc.id}-s1`,
    content: `content of ${id}`,
    searchId: `search-${id}`,
    metadata: null,
    createdAt: date,
    updatedAt: date,
    deletedAt: null,
    createdBy: 'u1',
    updatedBy: 'u1',
    section: { id: `${doc.id}-s1`, title: '世界妙嚴品', order: 1 },
    document: { ...document, workId, work: { title: workTitle } },
  };
}

function candidate(id: string, doc: Doc, passageKey: string | null, order = 1): AlignedCandidate {
  const { workTitle: _workTitle, ...document } = doc;
  return { id, content: `content of ${id}`, passageKey, order, document };
}

const assemble = (hitIds: string[], rows: HitRow[], candidates: AlignedCandidate[] = [], limit = 10) =>
  assembleParagraphSearchResults({ hitIds, rows, candidates, limit });

// ─── Hits ────────────────────────────────────────────────────────────────────

describe('assembleParagraphSearchResults — hits', () => {
  it('follows the hit order (relevance), not the order rows come back from the database', () => {
    const rows = [hitRow('a', docs.chinese, 'k1'), hitRow('b', docs.chinese, 'k2'), hitRow('c', docs.chinese, 'k3')];
    expect(assemble(['c', 'a', 'b'], rows).map((r) => r.id)).toEqual(['c', 'a', 'b']);
  });

  // Hits with no row are stale records, or parked rows the query left out. Skipping them must
  // not use up the limit, or a page of stale hits would show nothing.
  it('skips hits that resolve to no row, shows a repeated hit once, and limits only what is shown', () => {
    const rows = ['a', 'b', 'c'].map((id, i) => hitRow(id, docs.chinese, `k${i}`));
    expect(assemble(['gone', 'a', 'a', 'gone2', 'b', 'c'], rows, [], 2).map((r) => r.id)).toEqual(['a', 'b']);
  });

  // ParagraphList renders these fields.
  it("labels each result with its work, document and section, without the row's internal joins", () => {
    const [result] = assemble(['a'], [hitRow('a', docs.chinese, 'k1')]);
    expect(result.work).toEqual({ title: '華嚴經' });
    expect(result.document).toEqual({ id: 'zh', title: '大方廣佛華嚴經', language: 'chinese', key: 'chinese' });
    expect(result.section).toEqual({ id: 'zh-s1', title: '世界妙嚴品', order: 1 });
    expect(result).toMatchObject({ id: 'a', content: 'content of a', updatedBy: 'u1', updatedAt: date });
  });
});

// ─── Aligned paragraphs ──────────────────────────────────────────────────────

describe('assembleParagraphSearchResults — aligned paragraphs', () => {
  it("pairs a hit with the same passage in the work's other documents only", () => {
    const [result] = assemble(
      ['a'],
      [hitRow('a', docs.chinese, 'k1')],
      [candidate('a', docs.chinese, 'k1'), candidate('e1', docs.btts, 'k1'), candidate('e2', docs.btts, 'k2')],
    );
    expect(result.aligned).toEqual([
      {
        id: 'e1',
        content: 'content of e1',
        document: { id: 'btts', title: 'Avatamsaka Sutra', language: 'english', key: 'btts' },
      },
    ]);
  });

  // Passage keys are only meaningful within a work, and a second row with the hit's key in its
  // own document is a duplicate, not a counterpart.
  it("ignores another work's paragraph with the same key, and duplicates in the hit's own document", () => {
    const [result] = assemble(
      ['a'],
      [hitRow('a', docs.chinese, 'k1')],
      [candidate('x', docs.other, 'k1'), candidate('dup', docs.chinese, 'k1')],
    );
    expect(result.aligned).toEqual([]);
  });
});
