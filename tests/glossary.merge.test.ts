import { describe, expect, it } from 'vitest';

import {
  mergeTranslations,
  mergeTranslationsWithStatus,
  translationKey,
  type MergeableTranslation,
} from '~/services/glossary.merge';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTranslation(overrides: Partial<MergeableTranslation> & { term: string }): MergeableTranslation {
  return {
    sourceName: '',
    volume: '',
    sourceText: null,
    targetText: null,
    author: null,
    ...overrides,
  };
}

// ─── translationKey ──────────────────────────────────────────────────────────

describe('translationKey', () => {
  it('ignores surrounding whitespace and case', () => {
    expect(translationKey(makeTranslation({ term: ' Bodhisattva ', sourceName: 'Lotus', volume: '1' }))).toBe(
      translationKey(makeTranslation({ term: 'bodhisattva', sourceName: 'lotus', volume: '1' })),
    );
  });

  it('separates the same term coming from a different source', () => {
    expect(translationKey(makeTranslation({ term: 'bodhisattva', sourceName: 'Lotus', volume: '1' }))).not.toBe(
      translationKey(makeTranslation({ term: 'bodhisattva', sourceName: 'Lotus', volume: '2' })),
    );
  });

  it('separates two passages from one source that settle on the same term', () => {
    const base = { term: 'bodhisattva', sourceName: 'Lotus', volume: '1' };

    expect(translationKey(makeTranslation({ ...base, sourceText: '菩薩摩訶薩' }))).not.toBe(
      translationKey(makeTranslation({ ...base, sourceText: '諸菩薩眾' })),
    );
  });

  it('separates translations that differ only by author', () => {
    const base = { term: 'bodhisattva', sourceName: 'Lotus', volume: '1' };

    expect(translationKey(makeTranslation({ ...base, author: 'one' }))).not.toBe(
      translationKey(makeTranslation({ ...base, author: 'another' })),
    );
  });
});

// ─── mergeTranslations ───────────────────────────────────────────────────────

describe('mergeTranslations', () => {
  // The whole point of the merge: an import file carries one source, and everything the
  // file does not mention has to survive the write.
  it('keeps stored translations the incoming file does not mention', () => {
    const stored = [makeTranslation({ term: 'bodhisattva', sourceName: 'Lotus', volume: '1' })];
    const incoming = [makeTranslation({ term: 'awakened being', sourceName: 'Diamond', volume: '3' })];

    const merged = mergeTranslations(stored, incoming);

    expect(merged.map((t) => t.term)).toEqual(['bodhisattva', 'awakened being']);
  });

  // The rule that matters most: an import may add, never replace. Without a per-translation
  // id there is no way to tell a corrected passage from a second one, and merging them would
  // destroy the record of an attestation.
  it('keeps both when the incoming file differs from a stored translation', () => {
    const stored = [
      makeTranslation({
        term: 'bodhisattva',
        sourceName: 'Lotus',
        volume: '1',
        targetText: 'old rendering',
      }),
    ];
    const incoming = [
      makeTranslation({
        term: 'bodhisattva',
        sourceName: 'Lotus',
        volume: '1',
        targetText: 'corrected rendering',
      }),
    ];

    const merged = mergeTranslations(stored, incoming);

    expect(merged.map((t) => t.targetText)).toEqual(['old rendering', 'corrected rendering']);
  });

  it('keeps several passages from one sutra and volume that share an English term', () => {
    const base = { term: 'bodhisattva', sourceName: 'Lotus', volume: '1' };
    const incoming = [
      makeTranslation({ ...base, sourceText: '菩薩摩訶薩' }),
      makeTranslation({ ...base, sourceText: '諸菩薩眾' }),
    ];

    expect(mergeTranslations([], incoming)).toHaveLength(2);
  });

  it('preserves stored order and appends new translations at the end, in file order', () => {
    const stored = [
      makeTranslation({ term: 'a', sourceName: 'S', volume: '1' }),
      makeTranslation({ term: 'b', sourceName: 'S', volume: '2' }),
    ];
    const incoming = [
      makeTranslation({ term: 'd', sourceName: 'S', volume: '4' }),
      makeTranslation({ term: 'c', sourceName: 'S', volume: '3' }),
    ];

    expect(mergeTranslations(stored, incoming).map((t) => t.term)).toEqual(['a', 'b', 'd', 'c']);
  });

  // Content never matches: only a TranslationUUID makes a row an update. A row identical to a
  // stored translation is appended (and flagged, below).
  it('appends a row without an id even when it is identical to a stored translation', () => {
    const stored = [makeTranslation({ term: 'bodhisattva', sourceName: 'Lotus', volume: '1' })];
    const incoming = [makeTranslation({ term: 'bodhisattva', sourceName: 'Lotus', volume: '1' })];

    expect(mergeTranslations(stored, incoming)).toHaveLength(2);
  });

  it('appends rows of the incoming file that are identical to each other', () => {
    const incoming = [
      makeTranslation({ term: 'bodhisattva', sourceName: 'Lotus', volume: '1', author: 'first' }),
      makeTranslation({ term: 'bodhisattva', sourceName: 'Lotus', volume: '1', author: 'first' }),
    ];

    expect(mergeTranslations([], incoming)).toHaveLength(2);
  });

  it('keeps rows of the incoming file that differ in any field', () => {
    const incoming = [
      makeTranslation({ term: 'bodhisattva', sourceName: 'Lotus', volume: '1', author: 'first' }),
      makeTranslation({ term: 'bodhisattva', sourceName: 'Lotus', volume: '1', author: 'second' }),
    ];

    expect(mergeTranslations([], incoming).map((t) => t.author)).toEqual(['first', 'second']);
  });

  it('handles a null stored list', () => {
    const incoming = [makeTranslation({ term: 'bodhisattva' })];
    expect(mergeTranslations(null, incoming)).toEqual(incoming);
  });

  // A metadata-only row (no EnglishTerm) produces no translations at all, which must not
  // be read as "delete everything".
  it('leaves stored translations alone when the file carries none', () => {
    const stored = [makeTranslation({ term: 'bodhisattva', sourceName: 'Lotus', volume: '1' })];
    expect(mergeTranslations(stored, [])).toEqual(stored);
  });
});

// ─── mergeTranslationsWithStatus ─────────────────────────────────────────────

describe('mergeTranslationsWithStatus', () => {
  it('labels each translation by what the import will do to it', () => {
    const stored = [
      makeTranslation({ term: 'untouched', sourceName: 'S', volume: '1' }),
      makeTranslation({ term: 'revised', sourceName: 'S', volume: '2', targetText: 'old' }),
    ];
    const incoming = [
      makeTranslation({ term: 'revised', sourceName: 'S', volume: '2', targetText: 'new' }),
      makeTranslation({ term: 'added', sourceName: 'S', volume: '3' }),
    ];

    // Without a TranslationUUID the revised one arrives as a separate translation rather than
    // replacing what is stored: nothing tells the importer it is a correction.
    expect(mergeTranslationsWithStatus(stored, incoming).map((m) => [m.translation.term, m.status])).toEqual([
      ['untouched', 'kept'],
      ['revised', 'kept'],
      ['revised', 'new'],
      ['added', 'new'],
    ]);
  });
});

// ─── The duplicate flag ──────────────────────────────────────────────────────

describe('mergeTranslationsWithStatus — duplicates', () => {
  const lotus = (extra: Partial<MergeableTranslation> = {}) =>
    makeTranslation({ term: 'bodhisattva', sourceName: 'Lotus', volume: '1', targetText: 'text', ...extra });

  it('flags a new row identical to a stored translation, as a re-import of an id-less file would be', () => {
    const merged = mergeTranslationsWithStatus([lotus()], [lotus()]);
    expect(merged.map((m) => [m.status, m.duplicate])).toEqual([
      ['kept', undefined],
      ['new', true],
    ]);
  });

  it('flags a row identical to an earlier row of the file', () => {
    expect(mergeTranslationsWithStatus([], [lotus(), lotus()]).map((m) => m.duplicate)).toEqual([false, true]);
  });

  it('compares exactly: case, spacing or any other field makes it no duplicate', () => {
    const stored = [lotus()];
    for (const row of [
      lotus({ term: 'Bodhisattva' }),
      lotus({ term: 'bodhisattva ' }),
      lotus({ volume: '2' }),
      lotus({ sourceText: '菩薩' }),
      lotus({ author: 'someone' }),
    ]) {
      expect(mergeTranslationsWithStatus(stored, [row])[1].duplicate, JSON.stringify(row)).toBe(false);
    }
  });

  it('treats a blank cell as an empty stored value, and ignores the discussion', () => {
    const stored = [lotus({ sourceText: null, discussion: 'why' })];
    expect(mergeTranslationsWithStatus(stored, [lotus({ sourceText: '', discussion: null })])[1].duplicate).toBe(true);
  });

  it('flags a row repeating an updated translation’s new content', () => {
    const stored = [{ ...lotus(), id: 't1' }];
    const merged = mergeTranslationsWithStatus(stored, [lotus({ id: 't1', term: 'new' }), lotus({ term: 'new' })]);
    expect(merged.map((m) => [m.status, m.duplicate])).toEqual([
      ['updated', undefined],
      ['new', true],
    ]);
  });
});

// ─── Matching by TranslationUUID (PR 6b) ─────────────────────────────────────

describe('mergeTranslationsWithStatus — by TranslationUUID', () => {
  type Stored = MergeableTranslation & { language: string; phonetic?: string | null };
  const stored = (id: string, glossary: string, extra: Partial<Stored> = {}): Stored => ({
    ...makeTranslation({ term: glossary, sourceName: 'S', volume: '1' }),
    id,
    language: 'english',
    updatedBy: 'editor',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...extra,
  });
  const fileRow = (glossary: string, extra: Partial<Stored> = {}): Stored =>
    ({
      ...makeTranslation({ term: glossary, sourceName: 'S', volume: '1' }),
      language: 'english',
      updatedBy: 'importer',
      updatedAt: '2026-11-06T00:00:00.000Z',
      ...extra,
    }) as Stored;

  it('updates the named translation in place, keeping its id and what the file cannot carry', () => {
    const a = stored('t1', 'Buddha', { language: 'sanskrit', phonetic: 'bud-dha' });
    const b = stored('t2', 'Dharma');
    const merged = mergeTranslationsWithStatus([a, b], [fileRow('the Buddha', { id: 't1', targetText: 'fixed' })]);

    expect(merged.map((m) => [m.translation.id, m.translation.term, m.status])).toEqual([
      ['t1', 'the Buddha', 'updated'],
      ['t2', 'Dharma', 'kept'],
    ]);
    expect(merged[0].translation).toMatchObject({
      language: 'sanskrit',
      phonetic: 'bud-dha',
      targetText: 'fixed',
      updatedBy: 'importer',
    });
  });

  it('reports a named translation the file repeats unchanged as kept, untouched', () => {
    const a = stored('t1', 'Buddha');
    const [merged] = mergeTranslationsWithStatus([a], [fileRow('Buddha', { id: 't1' })]);
    expect(merged.status).toBe('kept');
    expect(merged.translation).toBe(a);
  });

  it('treats a blank cell and a stored null as the same', () => {
    const a = stored('t1', 'Buddha', { sourceText: null });
    expect(mergeTranslationsWithStatus([a], [fileRow('Buddha', { id: 't1', sourceText: '' })])[0].status).toBe('kept');
  });

  it('leaves the discussion alone when the file has no Discussion column, and clears it on a blank cell', () => {
    const a = stored('t1', 'Buddha', { discussion: 'why' });
    const absent = mergeTranslationsWithStatus([a], [fileRow('Buddha', { id: 't1', discussion: undefined })])[0];
    expect(absent).toMatchObject({ status: 'kept', translation: { discussion: 'why' } });

    const blank = mergeTranslationsWithStatus([a], [fileRow('Buddha', { id: 't1', discussion: null })])[0];
    expect(blank).toMatchObject({ status: 'updated', translation: { discussion: null } });

    const changed = mergeTranslationsWithStatus([a], [fileRow('Buddha', { id: 't1', discussion: 'because' })])[0];
    expect(changed).toMatchObject({ status: 'updated', translation: { discussion: 'because' } });
  });

  it('appends a row whose id names none of the term’s translations, without the id', () => {
    const a = stored('t1', 'Buddha');
    const merged = mergeTranslationsWithStatus(
      [a],
      [fileRow('Buddha', { id: 'from-elsewhere' }), fileRow('Dharma', { id: 'other-env' })],
    );
    expect(merged.map((m) => [m.translation.term, m.status, m.duplicate])).toEqual([
      ['Buddha', 'kept', undefined],
      ['Buddha', 'new', true],
      ['Dharma', 'new', false],
    ]);
    expect(merged[1].translation).not.toHaveProperty('id');
    expect(merged[2].translation).not.toHaveProperty('id');
  });

  it('lets the first row naming an id update it; a second one is appended', () => {
    const a = stored('t1', 'Buddha');
    const merged = mergeTranslationsWithStatus([a], [fileRow('first', { id: 't1' }), fileRow('second', { id: 't1' })]);
    expect(merged.map((m) => [m.translation.id, m.translation.term, m.status])).toEqual([
      ['t1', 'first', 'updated'],
      [undefined, 'second', 'new'],
    ]);
  });

  // An import never removes a translation, not even an exact duplicate already stored.
  it('keeps stored exact duplicates', () => {
    const merged = mergeTranslationsWithStatus([stored('t1', 'Buddha'), stored('t2', 'Buddha')], []);
    expect(merged.map((m) => [m.translation.id, m.status])).toEqual([
      ['t1', 'kept'],
      ['t2', 'kept'],
    ]);
  });
});
