import type { ParseKeys } from 'i18next';

import type { AppTFunction, NAMESPACES } from './config';

import { translator } from './config';

export type TranslationKey = ParseKeys<typeof NAMESPACES>;

// Renders a key that isn't a literal at the call site (a LocalizedError's stored
// key, or one built from a prefix), so the typed `t` signature can't check it.
// The locale test still guarantees every key exists in each locale.
export const translateKey = (t: AppTFunction, key: string, values?: Record<string, unknown>) =>
  (t as unknown as (key: string, values?: Record<string, unknown>) => string)(key, values);

// An error a user is meant to read. Services throw it with a key instead of
// prose, so the action can render it in the request's locale. `message` stays the
// English text, so logs, tests and callers that don't localise are unaffected.
export class LocalizedError extends Error {
  constructor(
    readonly key: TranslationKey,
    readonly values?: Record<string, unknown>,
  ) {
    super(translateKey(translator('en'), key, values));
    this.name = 'LocalizedError';
  }
}

export function localizeError(error: unknown, t: AppTFunction): string {
  if (error instanceof LocalizedError) return translateKey(t, error.key, error.values);
  return error instanceof Error ? error.message : String(error);
}
