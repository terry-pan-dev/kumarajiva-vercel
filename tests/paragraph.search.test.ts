import { describe, expect, it } from 'vitest';

import {
  type AlignedCandidate,
  assembleParagraphSearchResults,
  type HitRow,
  type SearchDocument,
} from '~/services/paragraph.search';

// ─── Fixtures ────────────────────────────────────────────────────────────────
// One work (Huayan) with a Chinese source and two English renderings, plus a second work whose
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
  cleary: { id: 'cl', title: 'Flower Ornament', language: 'english', key: 'cleary', workId: 'w1', workTitle: '華嚴經' },
  other: { id: 'lz', title: '楞嚴經', language: 'chinese', key: null, workId: 'w2', workTitle: '楞嚴經' },
} satisfies Record<string, Doc>;

const date = new Date('2026-11-01T00:00:00Z');

function hitRow(id: string, doc: Doc, passageKey: string | null, overrides: Partial<HitRow> = {}): HitRow {
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
    ...overrides,
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

  // The stale records a rebuild removes: hits whose row no longer exists.
  it('skips hits that resolve to no row', () => {
    const rows = [hitRow('a', docs.chinese, 'k1')];
    expect(assemble(['gone', 'a', 'also-gone'], rows).map((r) => r.id)).toEqual(['a']);
  });

  it('skips hits on parked rows, which every reader view hides', () => {
    const rows = [hitRow('a', docs.chinese, 'k1', { order: -1 }), hitRow('b', docs.chinese, 'k2')];
    expect(assemble(['a', 'b'], rows).map((r) => r.id)).toEqual(['b']);
  });

  it('shows a paragraph the index holds twice only once', () => {
    const rows = [hitRow('a', docs.chinese, 'k1'), hitRow('b', docs.chinese, 'k2')];
    expect(assemble(['a', 'a', 'b', 'a'], rows).map((r) => r.id)).toEqual(['a', 'b']);
  });

  // Skipped hits must not use up the limit, or a page of stale hits would show nothing.
  it('applies the limit to shown results only', () => {
    const rows = ['a', 'b', 'c', 'd'].map((id, i) => hitRow(id, docs.chinese, `k${i}`));
    expect(assemble(['gone1', 'a', 'gone2', 'b', 'c', 'd'], rows, [], 2).map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('returns nothing for no hits', () => {
    expect(assemble([], [hitRow('a', docs.chinese, 'k1')])).toEqual([]);
  });

  it("labels each result with its work, document and section, without the row's internal joins", () => {
    const [result] = assemble(['a'], [hitRow('a', docs.chinese, 'k1')]);
    expect(result.work).toEqual({ title: '華嚴經' });
    expect(result.document).toEqual({ id: 'zh', title: '大方廣佛華嚴經', language: 'chinese', key: 'chinese' });
    expect(result.section).toEqual({ id: 'zh-s1', title: '世界妙嚴品', order: 1 });
    // The row's own fields come through for the detail card (updatedBy/updatedAt).
    expect(result).toMatchObject({ id: 'a', content: 'content of a', order: 1, updatedBy: 'u1', updatedAt: date });
  });
});

// ─── Aligned paragraphs ──────────────────────────────────────────────────────

describe('assembleParagraphSearchResults — aligned paragraphs', () => {
  it("pairs a hit with the same passage in the work's other documents", () => {
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

  it('works from either side: an English hit is paired with its Chinese source', () => {
    const [result] = assemble(['e1'], [hitRow('e1', docs.btts, 'k1')], [candidate('a', docs.chinese, 'k1')]);
    expect(result.aligned.map((a) => a.id)).toEqual(['a']);
  });

  // Passage keys are only meaningful within a work.
  it('ignores a paragraph in another work that happens to share the passage key', () => {
    const [result] = assemble(['a'], [hitRow('a', docs.chinese, 'k1')], [candidate('x', docs.other, 'k1')]);
    expect(result.aligned).toEqual([]);
  });

  it("does not count a duplicate key in the hit's own document as a counterpart", () => {
    const [result] = assemble(['a'], [hitRow('a', docs.chinese, 'k1')], [candidate('dup', docs.chinese, 'k1')]);
    expect(result.aligned).toEqual([]);
  });

  it('leaves out parked counterparts', () => {
    const [result] = assemble(['a'], [hitRow('a', docs.chinese, 'k1')], [candidate('e1', docs.btts, 'k1', -2)]);
    expect(result.aligned).toEqual([]);
  });

  it('pairs nothing with a hit that has no passage key', () => {
    const [result] = assemble(['a'], [hitRow('a', docs.chinese, null)], [candidate('e1', docs.btts, null)]);
    expect(result.aligned).toEqual([]);
  });

  it('lists several counterparts in document-title order', () => {
    const [result] = assemble(
      ['a'],
      [hitRow('a', docs.chinese, 'k1')],
      [candidate('c1', docs.cleary, 'k1'), candidate('e1', docs.btts, 'k1')],
    );
    expect(result.aligned.map((a) => a.document.title)).toEqual(['Avatamsaka Sutra', 'Flower Ornament']);
  });

  it('gives each hit its own counterparts', () => {
    const results = assemble(
      ['a', 'b'],
      [hitRow('a', docs.chinese, 'k1'), hitRow('b', docs.chinese, 'k2')],
      [candidate('e1', docs.btts, 'k1'), candidate('e2', docs.btts, 'k2')],
    );
    expect(results.map((r) => r.aligned.map((a) => a.id))).toEqual([['e1'], ['e2']]);
  });
});
