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
