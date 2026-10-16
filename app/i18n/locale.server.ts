import { translator, type Locale } from './config';
import { readLocaleCookie, resolveLocale } from './locale';

// Phase 1 keeps the UI language in a cookie only, so it is per browser rather
// than per user and needs no schema change.
export function getLocale(request: Request): Locale {
  return resolveLocale(readLocaleCookie(request.headers.get('Cookie')), request.headers.get('Accept-Language'));
}

// For actions that return messages the page displays as-is.
export async function getFixedT(request: Request) {
  return translator(getLocale(request));
}
