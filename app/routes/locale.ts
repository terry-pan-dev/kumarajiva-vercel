import { json, type ActionFunctionArgs } from '@vercel/remix';

import { isLocale } from '~/i18n/config';
import { localeCookie } from '~/i18n/locale.server';

// Stores the chosen UI language. Posted to by a fetcher, so Remix revalidates
// the root loader afterwards and the page re-renders in the new language.
export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const locale = formData.get('locale');
  if (!isLocale(locale)) {
    return json({ success: false }, { status: 400 });
  }
  return json({ success: true }, { headers: { 'Set-Cookie': await localeCookie.serialize(locale) } });
};
