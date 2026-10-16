import { describe, expect, it } from 'vitest';

import { resources, SUPPORTED_LOCALES, translator } from '~/i18n/config';
import { LocalizedError, localizeError } from '~/i18n/errors';
import { matchAcceptLanguage, resolveLocale } from '~/i18n/locale';

// Plural forms differ by language (English has _one/_other, Chinese only
// _other), so keys are compared without their plural suffix.
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

function flattenKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix.replace(PLURAL_SUFFIX, '')];
  return Object.entries(value).flatMap(([key, child]) => flattenKeys(child, prefix ? `${prefix}.${key}` : key));
}

describe('locale files', () => {
  const namespaces = Object.keys(resources.en) as (keyof (typeof resources)['en'])[];

  for (const locale of SUPPORTED_LOCALES.filter((l) => l !== 'en')) {
    for (const ns of namespaces) {
      it(`${locale}/${ns}.json has exactly the keys of en/${ns}.json`, () => {
        const english = new Set(flattenKeys(resources.en[ns]));
        const translated = new Set(flattenKeys(resources[locale][ns]));
        expect({ missing: [...english].filter((k) => !translated.has(k)) }).toEqual({ missing: [] });
        expect({ unused: [...translated].filter((k) => !english.has(k)) }).toEqual({ unused: [] });
      });
    }
  }
});

describe('matchAcceptLanguage', () => {
  it('defaults to English without a header', () => {
    expect(matchAcceptLanguage(null)).toBe('en');
    expect(matchAcceptLanguage('')).toBe('en');
  });

  it('maps every Chinese variant to Traditional Chinese', () => {
    expect(matchAcceptLanguage('zh-TW')).toBe('zh-Hant');
    expect(matchAcceptLanguage('zh-Hant-HK,zh;q=0.9')).toBe('zh-Hant');
    expect(matchAcceptLanguage('zh-CN,zh;q=0.9')).toBe('zh-Hant');
    expect(matchAcceptLanguage('zh')).toBe('zh-Hant');
  });

  it('respects quality ordering', () => {
    expect(matchAcceptLanguage('en-US;q=0.5,zh-TW;q=0.9')).toBe('zh-Hant');
    expect(matchAcceptLanguage('zh-TW;q=0.3,en-GB')).toBe('en');
  });

  it('skips unsupported languages', () => {
    expect(matchAcceptLanguage('fr-FR,zh-TW;q=0.8')).toBe('zh-Hant');
    expect(matchAcceptLanguage('fr-FR,de')).toBe('en');
    expect(matchAcceptLanguage('zh;q=0,en;q=0.1')).toBe('en');
  });
});

describe('resolveLocale', () => {
  it('prefers a valid cookie over the browser header', () => {
    expect(resolveLocale('en', 'zh-TW')).toBe('en');
    expect(resolveLocale('zh-Hant', 'en-US')).toBe('zh-Hant');
  });

  it('ignores an invalid cookie', () => {
    expect(resolveLocale('fr', 'zh-TW')).toBe('zh-Hant');
    expect(resolveLocale(undefined, null)).toBe('en');
  });
});

describe('LocalizedError', () => {
  it('keeps the English text as its message', () => {
    const error = new LocalizedError('data:errors.workHasDocuments', { count: 2 });
    expect(error.message).toBe('This work still has 2 documents. Delete its documents before deleting the work.');
  });

  it('is rendered in the requested locale', () => {
    const error = new LocalizedError('data:errors.documentKeyTaken', { key: 'xuanzang' });
    expect(localizeError(error, translator('zh-Hant'))).toBe(
      '此典籍中已有其他文本使用鍵值「xuanzang」。鍵值在同一典籍內必須唯一。',
    );
  });

  it('passes plain errors through unchanged', () => {
    expect(localizeError(new Error('db exploded'), translator('zh-Hant'))).toBe('db exploded');
  });
});
