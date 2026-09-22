import { describe, expect, it } from 'vitest';

import {
  mergeTranslations,
  mergeTranslationsWithStatus,
  translationKey,
  type MergeableTranslation,
} from '~/services/glossary.merge';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTranslation(overrides: Partial<MergeableTranslation> & { glossary: string }): MergeableTranslation {
  return {
    sutraName: '',
    volume: '',
    originSutraText: null,
    targetSutraText: null,
    author: null,
    ...overrides,
  };
}

// ─── translationKey ──────────────────────────────────────────────────────────

describe('translationKey', () => {
  it('ignores surrounding whitespace and case', () => {
    expect(translationKey(makeTranslation({ glossary: ' Bodhisattva ', sutraName: 'Lotus', volume: '1' }))).toBe(
      translationKey(makeTranslation({ glossary: 'bodhisattva', sutraName: 'lotus', volume: '1' })),
    );
  });

  it('separates the same term coming from a different source', () => {
    expect(translationKey(makeTranslation({ glossary: 'bodhisattva', sutraName: 'Lotus', volume: '1' }))).not.toBe(
      translationKey(makeTranslation({ glossary: 'bodhisattva', sutraName: 'Lotus', volume: '2' })),
    );
  });

  it('separates two passages from one source that settle on the same term', () => {
    const base = { glossary: 'bodhisattva', sutraName: 'Lotus', volume: '1' };

    expect(translationKey(makeTranslation({ ...base, originSutraText: '菩薩摩訶薩' }))).not.toBe(
      translationKey(makeTranslation({ ...base, originSutraText: '諸菩薩眾' })),
    );
  });

  it('separates translations that differ only by author', () => {
    const base = { glossary: 'bodhisattva', sutraName: 'Lotus', volume: '1' };

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
    const stored = [makeTranslation({ glossary: 'bodhisattva', sutraName: 'Lotus', volume: '1' })];
    const incoming = [makeTranslation({ glossary: 'awakened being', sutraName: 'Diamond', volume: '3' })];

    const merged = mergeTranslations(stored, incoming);

    expect(merged.map((t) => t.glossary)).toEqual(['bodhisattva', 'awakened being']);
  });

  // The rule that matters most: an import may add, never replace. Without a per-translation
  // id there is no way to tell a corrected passage from a second one, and merging them would
  // destroy the record of an attestation.
  it('keeps both when the incoming file differs from a stored translation', () => {
    const stored = [
      makeTranslation({
        glossary: 'bodhisattva',
        sutraName: 'Lotus',
        volume: '1',
        targetSutraText: 'old rendering',
      }),
    ];
    const incoming = [
      makeTranslation({
        glossary: 'bodhisattva',
        sutraName: 'Lotus',
        volume: '1',
        targetSutraText: 'corrected rendering',
      }),
    ];

    const merged = mergeTranslations(stored, incoming);

    expect(merged.map((t) => t.targetSutraText)).toEqual(['old rendering', 'corrected rendering']);
  });

  it('keeps several passages from one sutra and volume that share an English term', () => {
    const base = { glossary: 'bodhisattva', sutraName: 'Lotus', volume: '1' };
    const incoming = [
      makeTranslation({ ...base, originSutraText: '菩薩摩訶薩' }),
      makeTranslation({ ...base, originSutraText: '諸菩薩眾' }),
    ];

    expect(mergeTranslations([], incoming)).toHaveLength(2);
  });

  it('preserves stored order and appends new translations at the end', () => {
    const stored = [
      makeTranslation({ glossary: 'a', sutraName: 'S', volume: '1' }),
      makeTranslation({ glossary: 'b', sutraName: 'S', volume: '2' }),
    ];
    const incoming = [
      makeTranslation({ glossary: 'c', sutraName: 'S', volume: '3' }),
      // Identical to a stored one, so it is recognised rather than appended again.
      makeTranslation({ glossary: 'b', sutraName: 'S', volume: '2' }),
    ];

    expect(mergeTranslations(stored, incoming).map((t) => t.glossary)).toEqual(['a', 'b', 'c']);
  });

  it('is idempotent — re-importing the same file changes nothing', () => {
    const incoming = [
      makeTranslation({ glossary: 'bodhisattva', sutraName: 'Lotus', volume: '1', targetSutraText: 'text' }),
    ];

    const once = mergeTranslations([], incoming);
    const twice = mergeTranslations(once, incoming);

    expect(twice).toEqual(once);
  });

  // The one case where two become one: rows identical in every field, which is what keeps a
  // re-import from doubling the list.
  it('collapses rows of the incoming file that are identical in every field', () => {
    const incoming = [
      makeTranslation({ glossary: 'bodhisattva', sutraName: 'Lotus', volume: '1', author: 'first' }),
      makeTranslation({ glossary: 'bodhisattva', sutraName: 'Lotus', volume: '1', author: 'first' }),
    ];

    expect(mergeTranslations([], incoming)).toHaveLength(1);
  });

  it('keeps rows of the incoming file that differ in any field', () => {
    const incoming = [
      makeTranslation({ glossary: 'bodhisattva', sutraName: 'Lotus', volume: '1', author: 'first' }),
      makeTranslation({ glossary: 'bodhisattva', sutraName: 'Lotus', volume: '1', author: 'second' }),
    ];

    expect(mergeTranslations([], incoming).map((t) => t.author)).toEqual(['first', 'second']);
  });

  it('handles a null stored list', () => {
    const incoming = [makeTranslation({ glossary: 'bodhisattva' })];
    expect(mergeTranslations(null, incoming)).toEqual(incoming);
  });

  // A metadata-only row (no EnglishTerm) produces no translations at all, which must not
  // be read as "delete everything".
  it('leaves stored translations alone when the file carries none', () => {
    const stored = [makeTranslation({ glossary: 'bodhisattva', sutraName: 'Lotus', volume: '1' })];
    expect(mergeTranslations(stored, [])).toEqual(stored);
  });
});

// ─── mergeTranslationsWithStatus ─────────────────────────────────────────────

describe('mergeTranslationsWithStatus', () => {
  it('labels each translation by what the import will do to it', () => {
    const stored = [
      makeTranslation({ glossary: 'untouched', sutraName: 'S', volume: '1' }),
      makeTranslation({ glossary: 'revised', sutraName: 'S', volume: '2', targetSutraText: 'old' }),
    ];
    const incoming = [
      makeTranslation({ glossary: 'revised', sutraName: 'S', volume: '2', targetSutraText: 'new' }),
      makeTranslation({ glossary: 'added', sutraName: 'S', volume: '3' }),
    ];

    // The revised one arrives as a separate translation rather than replacing what is stored:
    // nothing tells the importer whether it is a correction or another passage.
    expect(mergeTranslationsWithStatus(stored, incoming).map((m) => [m.translation.glossary, m.status])).toEqual([
      ['untouched', 'kept'],
      ['revised', 'kept'],
      ['revised', 'new'],
      ['added', 'new'],
    ]);
  });

  // updatedAt/updatedBy always differ on re-import; only file-carried content counts.
  it('reports an unchanged re-import as kept rather than updated', () => {
    const translation = makeTranslation({
      glossary: 'bodhisattva',
      sutraName: 'Lotus',
      volume: '1',
      targetSutraText: 'text',
    });

    expect(mergeTranslationsWithStatus([translation], [{ ...translation }]).map((m) => m.status)).toEqual(['kept']);
  });
});
