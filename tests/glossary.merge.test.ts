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

  it('lets the incoming file overwrite a stored translation with the same identity', () => {
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

    expect(merged).toHaveLength(1);
    expect(merged[0].targetSutraText).toBe('corrected rendering');
  });

  it('preserves stored order and appends new translations at the end', () => {
    const stored = [
      makeTranslation({ glossary: 'a', sutraName: 'S', volume: '1' }),
      makeTranslation({ glossary: 'b', sutraName: 'S', volume: '2' }),
    ];
    const incoming = [
      makeTranslation({ glossary: 'c', sutraName: 'S', volume: '3' }),
      makeTranslation({ glossary: 'b', sutraName: 'S', volume: '2', author: 'reviser' }),
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

  it('collapses duplicate keys within the incoming file', () => {
    const incoming = [
      makeTranslation({ glossary: 'bodhisattva', sutraName: 'Lotus', volume: '1', author: 'first' }),
      makeTranslation({ glossary: 'bodhisattva', sutraName: 'Lotus', volume: '1', author: 'second' }),
    ];

    const merged = mergeTranslations([], incoming);

    expect(merged).toHaveLength(1);
    expect(merged[0].author).toBe('first');
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

    expect(mergeTranslationsWithStatus(stored, incoming).map((m) => [m.translation.glossary, m.status])).toEqual([
      ['untouched', 'kept'],
      ['revised', 'updated'],
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
