import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SOURCE_NAME,
  DEFAULT_VOLUME,
  isBlocking,
  planMigration,
  planTerm,
  type PlannedRow,
  type SourceTerm,
  verifyRows,
} from '~/drizzle/migrations/data/08-glossary-translations.rows';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TERM_UPDATED_AT = new Date('2024-01-01T00:00:00.000Z');

function element(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    glossary: 'Buddha',
    language: 'english',
    sutraName: '華嚴經',
    volume: '3',
    originSutraText: '佛告阿難',
    targetSutraText: 'The Buddha told Ānanda',
    author: '翻譯團隊',
    updatedBy: 'user-1',
    updatedAt: '2025-06-01T10:00:00.000Z',
    ...overrides,
  };
}

function term(translations: unknown, overrides: Partial<SourceTerm> = {}): SourceTerm {
  return {
    id: 'term-1',
    glossary: '佛',
    translations,
    updatedAt: TERM_UPDATED_AT,
    updatedBy: 'term-user',
    deletedAt: null,
    ...overrides,
  };
}

const kinds = (t: SourceTerm) => planTerm(t).issues.map((i) => i.kind);

// ─── planTerm: mapping ───────────────────────────────────────────────────────

describe('planTerm mapping', () => {
  it('maps every JSON field to its column', () => {
    const { rows, issues } = planTerm(term([element()]));
    expect(issues).toEqual([]);
    expect(rows).toEqual([
      {
        glossaryId: 'term-1',
        position: 0,
        language: 'english',
        term: 'Buddha',
        sourceName: '華嚴經',
        volume: '3',
        sourceText: '佛告阿難',
        targetText: 'The Buddha told Ānanda',
        author: '翻譯團隊',
        rationale: null,
        metadata: null,
        createdAt: new Date('2025-06-01T10:00:00.000Z'),
        updatedAt: new Date('2025-06-01T10:00:00.000Z'),
        createdBy: 'user-1',
        updatedBy: 'user-1',
      },
    ]);
  });

  it('keeps the array order as position', () => {
    const { rows } = planTerm(
      term([element({ glossary: 'a' }), element({ glossary: 'b' }), element({ glossary: 'c' })]),
    );
    expect(rows.map((r) => [r.position, r.term])).toEqual([
      [0, 'a'],
      [1, 'b'],
      [2, 'c'],
    ]);
  });

  it('copies values as they are, without trimming, and keeps empty strings', () => {
    const { rows } = planTerm(term([element({ glossary: ' Buddha ', author: '', originSutraText: '', volume: '' })]));
    expect(rows[0]).toMatchObject({ term: ' Buddha ', author: '', sourceText: '', volume: '' });
  });

  it('maps missing optional passages and author to null', () => {
    const { rows, issues } = planTerm(
      term([element({ originSutraText: undefined, targetSutraText: null, author: undefined })]),
    );
    expect(issues).toEqual([]);
    expect(rows[0]).toMatchObject({ sourceText: null, targetText: null, author: null });
  });

  it('puts non-empty partOfSpeech and phonetic into metadata', () => {
    const { rows } = planTerm(term([element({ partOfSpeech: 'noun', phonetic: 'bʊdə' })]));
    expect(rows[0].metadata).toEqual({ partOfSpeech: 'noun', phonetic: 'bʊdə' });
  });

  it('leaves metadata null when partOfSpeech and phonetic are empty, as the create form writes them', () => {
    const { rows, issues } = planTerm(term([element({ partOfSpeech: '', phonetic: '  ' })]));
    expect(issues).toEqual([]);
    expect(rows[0].metadata).toBeNull();
  });

  it('copies a term with no translations to no rows', () => {
    expect(planTerm(term([]))).toEqual({ rows: [], issues: [], duplicates: [] });
  });
});

// ─── planTerm: defaults that are reported ────────────────────────────────────

describe('planTerm warnings', () => {
  it('fills a missing source and volume with the form defaults and reports it', () => {
    const t = term([element({ sutraName: undefined, volume: null })]);
    const { rows, issues } = planTerm(t);
    expect(rows[0]).toMatchObject({ sourceName: DEFAULT_SOURCE_NAME, volume: DEFAULT_VOLUME });
    expect(issues.map((i) => i.kind)).toEqual(['missing-source-name', 'missing-volume']);
    expect(issues.every((i) => !isBlocking(i.kind))).toBe(true);
  });

  it("falls back to the term's audit fields when the translation's are missing or invalid", () => {
    const { rows, issues } = planTerm(term([element({ updatedAt: 'not a date', updatedBy: '' })]));
    expect(rows[0]).toMatchObject({
      createdAt: TERM_UPDATED_AT,
      updatedAt: TERM_UPDATED_AT,
      createdBy: 'term-user',
      updatedBy: 'term-user',
    });
    expect(issues).toMatchObject([{ kind: 'audit-from-term', position: 0, detail: 'updatedAt, updatedBy' }]);
  });

  it('reports a null translations column as a warning with no rows', () => {
    expect(kinds(term(null))).toEqual(['translations-null']);
    expect(isBlocking('translations-null')).toBe(false);
  });
});

// ─── planTerm: blocking issues ───────────────────────────────────────────────

describe('planTerm blocking issues', () => {
  it.each([
    ['translations-not-array', term({ glossary: 'x' })],
    ['element-not-object', term(['Buddha'])],
    ['missing-rendering', term([element({ glossary: '' })])],
    ['missing-rendering', term([element({ glossary: undefined })])],
    ['invalid-language', term([element({ language: 'klingon' })])],
    ['invalid-language', term([element({ language: 'chinese' })])],
    ['unknown-field', term([element({ sense: 'enlightened one' })])],
  ])('%s blocks the copy', (kind, t) => {
    expect(kinds(t)).toContain(kind);
    expect(isBlocking(kind as never)).toBe(true);
  });

  it('names the unknown fields', () => {
    expect(planTerm(term([element({ sense: 'x', note: 'y' })])).issues[0].detail).toBe('sense, note');
  });

  it('accepts every non-Chinese language of the enum', () => {
    for (const language of ['english', 'sanskrit', 'indonesian']) {
      expect(planTerm(term([element({ language })])).issues).toEqual([]);
    }
  });
});

// ─── planTerm: duplicates ────────────────────────────────────────────────────

describe('planTerm duplicates', () => {
  it('keeps duplicates and reports their positions', () => {
    const { rows, duplicates } = planTerm(term([element(), element({ glossary: 'Awakened One' }), element()]));
    expect(rows).toHaveLength(3);
    expect(duplicates).toEqual([{ glossaryId: 'term-1', term: '佛', positions: [0, 2] }]);
  });

  it('uses the import identity: case and surrounding space do not make a translation distinct', () => {
    const { duplicates } = planTerm(term([element(), element({ glossary: ' buddha ' })]));
    expect(duplicates).toHaveLength(1);
  });

  it('does not count translations differing only in audit fields as distinct', () => {
    const { duplicates } = planTerm(term([element(), element({ updatedBy: 'someone else' })]));
    expect(duplicates).toHaveLength(1);
  });

  it('treats a different passage as a different translation', () => {
    const { duplicates } = planTerm(term([element(), element({ originSutraText: '佛言' })]));
    expect(duplicates).toEqual([]);
  });
});

// ─── planMigration ───────────────────────────────────────────────────────────

describe('planMigration', () => {
  it('copies trashed terms too and counts elements across terms', () => {
    const plan = planMigration([
      term([element(), element({ glossary: 'b' })]),
      term([element()], { id: 'term-2', deletedAt: new Date() }),
      term(null, { id: 'term-3' }),
    ]);
    expect(plan.terms).toBe(3);
    expect(plan.trashedTerms).toBe(1);
    expect(plan.elements).toBe(3);
    expect(plan.rows.map((r) => r.glossaryId)).toEqual(['term-1', 'term-1', 'term-2']);
  });
});

// ─── verifyRows ──────────────────────────────────────────────────────────────

describe('verifyRows', () => {
  const planned = (): PlannedRow[] =>
    planTerm(term([element(), element({ glossary: 'b', partOfSpeech: 'noun' })])).rows;
  // What the database returns: the planned values plus generated columns.
  const stored = (rows: PlannedRow[]) => rows.map((r, i) => ({ ...r, id: `id-${i}`, deletedAt: null }));

  it('accepts an exact copy, in any order', () => {
    expect(verifyRows(planned(), stored(planned()).reverse())).toEqual([]);
  });

  it('reports a missing row', () => {
    expect(verifyRows(planned(), stored(planned()).slice(0, 1))).toEqual([
      { kind: 'missing', glossaryId: 'term-1', position: 1 },
    ]);
  });

  it('reports an unexpected row', () => {
    const extra = { ...stored(planned())[0], position: 7 };
    expect(verifyRows(planned(), [...stored(planned()), extra])).toEqual([
      { kind: 'unexpected', glossaryId: 'term-1', position: 7 },
    ]);
  });

  it('reports a row stored twice', () => {
    const rows = stored(planned());
    expect(verifyRows(planned(), [...rows, rows[0]])).toEqual([
      { kind: 'unexpected', glossaryId: 'term-1', position: 0 },
    ]);
  });

  it('names the fields that differ, including dates and metadata', () => {
    const rows = stored(planned());
    rows[1] = {
      ...rows[1],
      targetText: 'changed',
      updatedAt: new Date(rows[1].updatedAt.getTime() + 1),
      metadata: { partOfSpeech: 'verb' },
    };
    expect(verifyRows(planned(), rows)).toEqual([
      { kind: 'different', glossaryId: 'term-1', position: 1, fields: ['targetText', 'metadata', 'updatedAt'] },
    ]);
  });
});
