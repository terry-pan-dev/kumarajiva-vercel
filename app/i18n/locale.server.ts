import { createCookie } from '@vercel/remix';

import { translator, type Locale } from './config';
import { resolveLocale } from './locale';

// Phase 1 keeps the UI language in a cookie only, so it is per browser rather
// than per user and needs no schema change.
export const localeCookie = createCookie('lng', {
  path: '/',
  sameSite: 'lax',
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  maxAge: 60 * 60 * 24 * 365,
});

export async function getLocale(request: Request): Promise<Locale> {
  const cookieValue = await localeCookie.parse(request.headers.get('Cookie'));
  return resolveLocale(cookieValue, request.headers.get('Accept-Language'));
}

// For actions that return messages the page displays as-is.
export async function getFixedT(request: Request) {
  return translator(await getLocale(request));
}
