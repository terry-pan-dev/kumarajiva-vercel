import { DEFAULT_TARGET_LANG, type Lang, SUPPORTED_LANGUAGES } from '~/utils/constants';

export function isValidLanguage(lang: string): lang is (typeof SUPPORTED_LANGUAGES)[number]['value'] {
  return SUPPORTED_LANGUAGES.some((l) => l.value === lang); //
}

// The language to translate into, from untrusted input (a request body or form field): a
// supported language as given, anything else (missing, misspelt, another type) the default.
export function targetLanguageOr(value: unknown, fallback: Lang = DEFAULT_TARGET_LANG): Lang {
  return typeof value === 'string' && isValidLanguage(value) ? value : fallback;
}

// Glossary entries are Chinese terms, so their translations are in any other language. Spelled
// out (a test keeps it equal to LANG_VALUES without Chinese) because form validation needs a
// fixed list.
export const GLOSSARY_TRANSLATION_LANGUAGES = ['english', 'sanskrit', 'indonesian'] as const satisfies readonly Exclude<
  Lang,
  'chinese'
>[];
