import { describe, expect, it } from 'vitest';

import { diffTranslations, sameContent, type StoredTranslation } from '~/services/glossary.diff';
import { type GlossaryTranslation } from '~/services/glossary.types';

const translation = (glossary: string, extra: Partial<GlossaryTranslation> = {}): GlossaryTranslation => ({
  glossary,
  language: 'english',
  sutraName: '華嚴經',
  volume: '1',
  updatedBy: 'user-1',
  updatedAt: '2025-01-01T00:00:00.000Z',
  ...extra,
});

const stored = (id: string, glossary: string, extra: Partial<GlossaryTranslation> = {}): StoredTranslation => ({
  ...translation(glossary, extra),
  id,
});

const a = stored('a', 'Buddha');
const b = stored('b', 'Dharma');
const c = stored('c', 'Sangha');

describe('diffTranslations', () => {
  it('finds nothing to do when the list is the stored one', () => {
    expect(diffTranslations([a, b, c], [a, b, c])).toEqual({ insert: [], update: [], remove: [] });
  });

  it('inserts a translation without an id at its place', () => {
    const added = translation('Saṅgha');
    expect(diffTranslations([a, b], [a, b, added])).toEqual({
      insert: [{ position: 2, translation: added }],
      update: [],
      remove: [],
    });
  });

  it('updates a stored translation whose content changed', () => {
    const edited = { ...b, glossary: 'the Dharma' };
    expect(diffTranslations([a, b], [a, edited]).update).toEqual([{ id: 'b', position: 1, translation: edited }]);
  });

  it('removes the stored translations the list leaves out, and renumbers the rest', () => {
    const diff = diffTranslations([a, b, c], [a, c]);
    expect(diff.remove).toEqual(['b']);
    expect(diff.update).toEqual([{ id: 'c', position: 1, translation: c }]);
    expect(diff.insert).toEqual([]);
  });

  it('updates the positions of translations that moved', () => {
    const diff = diffTranslations([a, b], [b, a]);
    expect(diff.update).toEqual([
      { id: 'b', position: 0, translation: b },
      { id: 'a', position: 1, translation: a },
    ]);
  });

  it('removes everything for an empty list', () => {
    expect(diffTranslations([a, b], [])).toEqual({ insert: [], update: [], remove: ['a', 'b'] });
  });

  it('inserts everything when nothing is stored', () => {
    const one = translation('one');
    expect(diffTranslations([], [one]).insert).toEqual([{ position: 0, translation: one }]);
  });

  it('leaves alone a translation whose only change is who touched it', () => {
    const touched = { ...a, updatedBy: 'user-2', updatedAt: '2026-01-01T00:00:00.000Z' };
    expect(diffTranslations([a], [touched]).update).toEqual([]);
  });

  it('refuses an id the term does not have', () => {
    expect(() => diffTranslations([a], [stored('other', 'Buddha')])).toThrow(/not one of this term/);
  });

  it('refuses an id given twice', () => {
    expect(() => diffTranslations([a, b], [a, a])).toThrow(/twice/);
  });
});

describe('sameContent', () => {
  it('treats null and absent as the same', () => {
    expect(sameContent(translation('x', { author: null }), translation('x'))).toBe(true);
  });

  it.each([
    'glossary',
    'language',
    'sutraName',
    'volume',
    'originSutraText',
    'targetSutraText',
    'author',
    'partOfSpeech',
    'phonetic',
    'rationale',
  ] as const)('sees a change in %s', (field) => {
    const before = translation('x', { originSutraText: 'a', targetSutraText: 'b', author: 'c' });
    const after = { ...before, [field]: field === 'language' ? 'sanskrit' : 'changed' };
    expect(sameContent(before, after)).toBe(false);
  });
});
