import { SUPPORTED_LANGUAGES } from '~/utils/constants';

export function isValidLanguage(lang: string): lang is (typeof SUPPORTED_LANGUAGES)[number]['value'] {
  return SUPPORTED_LANGUAGES.some((l) => l.value === lang); //
}
