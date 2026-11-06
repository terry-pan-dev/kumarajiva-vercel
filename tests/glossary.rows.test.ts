import { describe, expect, it } from 'vitest';

import { type ReadGlossaryTranslation } from '~/drizzle/tables';
import {
  groupByGlossaryId,
  newTranslationRow,
  toGlossaryTranslation,
  translationContent,
} from '~/services/glossary.rows';
import { type GlossaryTranslation } from '~/services/glossary.types';

const row = (extra: Partial<ReadGlossaryTranslation> = {}): ReadGlossaryTranslation => ({
  id: 't1',
  glossaryId: 'g1',
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
  createdAt: new Date('2025-01-01T00:00:00.000Z'),
  updatedAt: new Date('2025-06-01T10:00:00.000Z'),
  deletedAt: null,
  createdBy: 'user-0',
  updatedBy: 'user-1',
  ...extra,
});

const translation = (extra: Partial<GlossaryTranslation> = {}): GlossaryTranslation => ({
  glossary: 'Buddha',
  language: 'english',
  sutraName: '華嚴經',
  volume: '3',
  originSutraText: '佛告阿難',
  targetSutraText: 'The Buddha told Ānanda',
  author: '翻譯團隊',
  updatedBy: 'user-1',
  updatedAt: '2025-06-01T10:00:00.000Z',
  ...extra,
});

describe('toGlossaryTranslation', () => {
  it('maps every column to its read-shape field', () => {
    expect(
      toGlossaryTranslation(row({ rationale: 'why', metadata: { partOfSpeech: 'noun', phonetic: 'bud-dha' } })),
    ).toEqual({
      id: 't1',
      glossary: 'Buddha',
      language: 'english',
      sutraName: '華嚴經',
      volume: '3',
      originSutraText: '佛告阿難',
      targetSutraText: 'The Buddha told Ānanda',
      author: '翻譯團隊',
      partOfSpeech: 'noun',
      phonetic: 'bud-dha',
      rationale: 'why',
      updatedBy: 'user-1',
      updatedAt: '2025-06-01T10:00:00.000Z',
    });
  });

  // The edit form keeps a null but posts '' for an absent field; '' would read as an edit.
  it('gives partOfSpeech and phonetic as null, not absent, when there is no metadata', () => {
    const read = toGlossaryTranslation(row());
    expect(read.partOfSpeech).toBeNull();
    expect(read.phonetic).toBeNull();
  });
});

describe('translationContent', () => {
  it('maps every content field to its column', () => {
    expect(translationContent(translation({ rationale: 'why', partOfSpeech: 'noun', phonetic: 'bud-dha' }))).toEqual({
      language: 'english',
      term: 'Buddha',
      sourceName: '華嚴經',
      volume: '3',
      sourceText: '佛告阿難',
      targetText: 'The Buddha told Ānanda',
      author: '翻譯團隊',
      rationale: 'why',
      metadata: { partOfSpeech: 'noun', phonetic: 'bud-dha' },
    });
  });

  it('stores no metadata for empty partOfSpeech and phonetic, as migration 08 does', () => {
    expect(translationContent(translation({ partOfSpeech: '', phonetic: '  ' })).metadata).toBeNull();
    expect(translationContent(translation({ partOfSpeech: 'noun', phonetic: '' })).metadata).toEqual({
      partOfSpeech: 'noun',
    });
  });

  it('writes null for absent optional fields, and keeps an empty passage as it is', () => {
    const content = translationContent({ ...translation({ originSutraText: '' }), targetSutraText: undefined });
    expect(content.sourceText).toBe('');
    expect(content.targetText).toBeNull();
    expect(content.rationale).toBeNull();
  });
});

describe('newTranslationRow', () => {
  it('places the row and credits whoever last edited the translation', () => {
    expect(newTranslationRow('g1', 4, translation({ updatedBy: 'user-9' }))).toMatchObject({
      glossaryId: 'g1',
      position: 4,
      term: 'Buddha',
      createdBy: 'user-9',
      updatedBy: 'user-9',
    });
  });

  it('leaves the id and the times to the database', () => {
    const values = newTranslationRow('g1', 0, translation({ id: 'ignored' }));
    expect(values).not.toHaveProperty('id');
    expect(values).not.toHaveProperty('createdAt');
    expect(values).not.toHaveProperty('updatedAt');
  });
});

describe('groupByGlossaryId', () => {
  it('groups rows by term, each in position order', () => {
    const grouped = groupByGlossaryId([
      row({ id: 'b2', glossaryId: 'b', position: 2 }),
      row({ id: 'a1', glossaryId: 'a', position: 1 }),
      row({ id: 'b0', glossaryId: 'b', position: 0 }),
      row({ id: 'a0', glossaryId: 'a', position: 0 }),
    ]);
    expect([...grouped].map(([id, list]) => [id, list.map((t) => t.id)])).toEqual([
      ['b', ['b0', 'b2']],
      ['a', ['a0', 'a1']],
    ]);
  });
});

describe('round trip', () => {
  it('writes what it reads unchanged', () => {
    const read = toGlossaryTranslation(row({ metadata: { partOfSpeech: 'noun' } }));
    const written = { ...row(), ...translationContent(read) };
    expect(toGlossaryTranslation(written)).toEqual(read);
  });
});
