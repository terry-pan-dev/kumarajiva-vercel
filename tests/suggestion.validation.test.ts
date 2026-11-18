import { describe, expect, it } from 'vitest';

import {
  proposedEditSchema,
  proposedTermSchema,
  proposedTranslationSchema,
  suggestionContextSchema,
} from '~/validations/suggestion.validation';

// The shapes of a suggestion's values: as little as possible is required, blank means "not
// given", and an edit keeps only the fields it mentions.
describe('proposedTranslationSchema', () => {
  it('needs only a rendering, defaults to English and reads blanks as not given', () => {
    expect(proposedTranslationSchema.parse({ term: ' wisdom ', sourceText: '  ' })).toEqual({
      term: 'wisdom',
      language: 'english',
      sourceName: null,
      volume: null,
      sourceText: null,
      targetText: null,
      author: null,
      partOfSpeech: null,
      phonetic: null,
      discussion: null,
    });
  });

  it('refuses a blank rendering and a language the glossary does not translate into', () => {
    expect(proposedTranslationSchema.safeParse({ term: '  ' }).success).toBe(false);
    expect(proposedTranslationSchema.safeParse({ term: 'x', language: 'chinese' }).success).toBe(false);
  });
});

describe('proposedTermSchema', () => {
  it('takes a Chinese term and its first translation', () => {
    const parsed = proposedTermSchema.parse({ sourceTerm: '般若', translation: { term: 'prajñā' } });
    expect(parsed.sourceTerm).toBe('般若');
    expect(parsed.phonetic).toBeNull();
    expect(parsed.translation.term).toBe('prajñā');
  });

  it('refuses a term that is not Chinese, or no translation', () => {
    expect(proposedTermSchema.safeParse({ sourceTerm: 'prajna', translation: { term: 'x' } }).success).toBe(false);
    expect(proposedTermSchema.safeParse({ sourceTerm: '般若' }).success).toBe(false);
  });
});

describe('proposedEditSchema', () => {
  it('keeps the fields it mentions: a blank one is cleared (null), an absent one left out', () => {
    // Strict: an absent field must not come back as a key at all, not even undefined or null.
    expect(proposedEditSchema.parse({ term: 'insight', author: '  ' })).toStrictEqual({
      term: 'insight',
      author: null,
    });
  });

  it('refuses an edit that mentions nothing, a blank rendering and a language change', () => {
    expect(proposedEditSchema.safeParse({}).success).toBe(false);
    expect(proposedEditSchema.safeParse({ term: ' ' }).success).toBe(false);
    // language is not a field of an edit: dropped, which leaves nothing.
    expect(proposedEditSchema.safeParse({ language: 'sanskrit' }).success).toBe(false);
  });
});

describe('suggestionContextSchema', () => {
  it('keeps the known keys, drops the rest, and reads absent as null', () => {
    const paragraphId = '00000000-0000-4000-8000-000000000001';
    expect(suggestionContextSchema.parse({ paragraphId, page: '12', extra: 'x' })).toEqual({ paragraphId, page: '12' });
    expect(suggestionContextSchema.parse(undefined)).toBeNull();
    expect(suggestionContextSchema.safeParse({ paragraphId: 'not-a-uuid' }).success).toBe(false);
  });
});
