import { describe, expect, it } from 'vitest';

import {
  addsOrRemoves,
  diffTranslations,
  isStored,
  sameContent,
  type StoredTranslation,
  TranslationListError,
} from '~/services/glossary.diff';
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
    expect(diffTranslations([a, b], [a, edited]).update).toEqual([
      { id: 'b', position: 1, translation: edited, contentChanged: true },
    ]);
  });

  it('removes the stored translations the list leaves out, and renumbers the rest', () => {
    const diff = diffTranslations([a, b, c], [a, c]);
    expect(diff.remove).toEqual(['b']);
    expect(diff.update).toEqual([{ id: 'c', position: 1, translation: c, contentChanged: false }]);
    expect(diff.insert).toEqual([]);
  });

  it('updates the positions of translations that moved', () => {
    const diff = diffTranslations([a, b], [b, a]);
    expect(diff.update).toEqual([
      { id: 'b', position: 0, translation: b, contentChanged: false },
      { id: 'a', position: 1, translation: a, contentChanged: false },
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
    expect(() => diffTranslations([a], [stored('other', 'Buddha')])).toThrow(TranslationListError);
  });

  it('refuses an id given twice', () => {
    expect(() => diffTranslations([a, b], [a, a])).toThrow(/twice/);
    expect(() => diffTranslations([a, b], [a, a])).toThrow(TranslationListError);
  });

  it('marks a translation that moved and changed as changed', () => {
    const edited = { ...b, glossary: 'the Dharma' };
    expect(diffTranslations([a, b], [edited]).update).toEqual([
      { id: 'b', position: 0, translation: edited, contentChanged: true },
    ]);
  });
});

describe('isStored', () => {
  it('is true only for a translation with an id', () => {
    expect(isStored(a)).toBe(true);
    expect(isStored(translation('new'))).toBe(false);
    expect(isStored({ ...translation('new'), id: '' })).toBe(false);
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

// The edit form's permission rule: Update edits, Maintain also adds and removes.
describe('addsOrRemoves', () => {
  it('is false for edits and moves only', () => {
    expect(addsOrRemoves([a, b], [{ ...a, glossary: 'the Buddha' }, b])).toBe(false);
    expect(addsOrRemoves([a, b], [b, a])).toBe(false);
  });

  it('is true when a translation is left out', () => {
    expect(addsOrRemoves([a, b], [a])).toBe(true);
  });

  it('is true when a translation without an id is added', () => {
    expect(addsOrRemoves([a], [a, translation('new')])).toBe(true);
  });

  it('is true when one translation replaces another and the list keeps its length', () => {
    expect(addsOrRemoves([a, b], [a, translation('Dharma')])).toBe(true);
  });

  it('refuses a list built from other translations', () => {
    expect(() => addsOrRemoves([a], [stored('other', 'Buddha')])).toThrow(TranslationListError);
  });
});

// The ids the list was built from: a stored translation outside them was added meanwhile.
describe('diffTranslations with a basis', () => {
  it('keeps a translation added since the list was built, after the listed ones', () => {
    // The list was built from a and b; c was added by someone else meanwhile.
    const added = translation('new');
    expect(diffTranslations([a, b, c], [a, b, added], ['a', 'b'])).toEqual({
      insert: [{ position: 2, translation: added }],
      update: [{ id: 'c', position: 3, translation: c, contentChanged: false }],
      remove: [],
    });
  });

  it('still removes a known translation the list leaves out', () => {
    const diff = diffTranslations([a, b, c], [a], ['a', 'b']);
    expect(diff.remove).toEqual(['b']);
    expect(diff.update).toEqual([{ id: 'c', position: 1, translation: c, contentChanged: false }]);
  });

  it('keeps unknown ones in their stored order and leaves them alone when already in place', () => {
    const diff = diffTranslations([a, b, c], [a], ['a']);
    expect(diff.remove).toEqual([]);
    expect(diff.update).toEqual([]);
  });

  it('ignores basis ids that are no longer stored', () => {
    expect(diffTranslations([a], [a], ['a', 'gone'])).toEqual({ insert: [], update: [], remove: [] });
  });

  it('an empty basis knows nothing, so nothing is removed', () => {
    expect(diffTranslations([a, b], [], []).remove).toEqual([]);
  });

  it('still refuses an id that is not stored', () => {
    expect(() => diffTranslations([a], [stored('gone', 'x')], ['a', 'gone'])).toThrow(TranslationListError);
  });

  it('a translation added meanwhile is no removal for the edit permission', () => {
    expect(addsOrRemoves([a, b, c], [a, b], ['a', 'b'])).toBe(false);
    expect(addsOrRemoves([a, b, c], [a, b], undefined)).toBe(true);
  });
});
