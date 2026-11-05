import { describe, expect, it } from 'vitest';

import { LANG_VALUES } from '~/utils/constants';
import { GLOSSARY_TRANSLATION_LANGUAGES, targetLanguageOr } from '~/utils/lang';

describe('targetLanguageOr', () => {
  it('passes every supported language through', () => {
    for (const lang of LANG_VALUES) expect(targetLanguageOr(lang)).toBe(lang);
  });

  // Request bodies are untrusted: anything that is not a supported language falls back.
  it('falls back to English for anything else', () => {
    for (const value of [undefined, null, '', 'English', 'french', 42, ['english'], { lang: 'english' }]) {
      expect(targetLanguageOr(value)).toBe('english');
    }
  });

  it('uses the given fallback when one is passed', () => {
    expect(targetLanguageOr('klingon', 'indonesian')).toBe('indonesian');
  });
});

describe('GLOSSARY_TRANSLATION_LANGUAGES', () => {
  // Spelled out for form validation; this keeps it in step with LANG_VALUES.
  it('is every supported language except Chinese, in the same order', () => {
    expect([...GLOSSARY_TRANSLATION_LANGUAGES]).toEqual(LANG_VALUES.filter((lang) => lang !== 'chinese'));
  });

  it('starts with English, the default', () => {
    expect(GLOSSARY_TRANSLATION_LANGUAGES[0]).toBe('english');
  });
});
