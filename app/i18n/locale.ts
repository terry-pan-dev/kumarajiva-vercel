import { DEFAULT_LOCALE, isLocale, type Locale } from './config';

// Picks the best supported locale from an Accept-Language header. Every Chinese
// variant maps to zh-Hant because Traditional is the only Chinese we ship; a
// Simplified reader is still better served by it than by English.
export function matchAcceptLanguage(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;

  const tags = header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.find((p) => p.trim().startsWith('q='));
      return { tag: tag.trim().toLowerCase(), q: q ? Number(q.trim().slice(2)) : 1 };
    })
    .filter(({ tag, q }) => tag && !Number.isNaN(q) && q > 0)
    .sort((a, b) => b.q - a.q);

  for (const { tag } of tags) {
    if (tag === 'zh' || tag.startsWith('zh-')) return 'zh-Hant';
    if (tag === 'en' || tag.startsWith('en-')) return 'en';
  }
  return DEFAULT_LOCALE;
}

// An explicit choice (the cookie) wins over what the browser asks for.
export function resolveLocale(cookieValue: unknown, acceptLanguage: string | null | undefined): Locale {
  return isLocale(cookieValue) ? cookieValue : matchAcceptLanguage(acceptLanguage);
}

// The chosen UI language lives in a plain `lng` cookie. The browser writes it when the
// language toggle is clicked, so switching needs no request; the server reads it to render
// pages and action messages in that language.
export const LOCALE_COOKIE = 'lng';
const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function readLocaleCookie(cookieHeader: string | null | undefined): Locale | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name !== LOCALE_COOKIE) continue;
    const value = decodeURIComponent(rest.join('='));
    if (isLocale(value)) return value;
    // Earlier versions set the cookie through Remix's createCookie, which stores
    // base64-encoded JSON (`"zh-Hant"` → `InpoLUhhbnQi`). Read those so nobody's choice is lost.
    try {
      const legacy: unknown = JSON.parse(atob(value));
      if (isLocale(legacy)) return legacy;
    } catch {
      // Not a legacy value either; fall through to Accept-Language.
    }
    return null;
  }
  return null;
}

// The language a route's meta function should use. Meta runs on the server and again in the
// browser on every navigation; in the browser the root loader's locale goes stale after the
// toggle switches language, while <html lang> follows it.
export function pageLocale(rootLocale: unknown): Locale {
  if (typeof document !== 'undefined' && isLocale(document.documentElement.lang)) {
    return document.documentElement.lang;
  }
  return isLocale(rootLocale) ? rootLocale : DEFAULT_LOCALE;
}

// Browser only.
export function writeLocaleCookie(locale: Locale) {
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
}
