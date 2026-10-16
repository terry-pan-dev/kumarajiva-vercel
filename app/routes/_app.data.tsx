import type { LoaderFunctionArgs, MetaFunction } from '@vercel/remix';

import { json, Outlet, redirect, useLoaderData, useLocation } from '@remix-run/react';
import { useTranslation } from 'react-i18next';

import type { loader as rootLoader } from '~/root';

import { assertAuthUser } from '~/auth.server';
import { defineAbilityFor } from '~/authorisation';
import { LanguageToggle } from '~/components/LanguageToggle';
import { SideBarTrigger } from '~/components/SideBarTrigger';
import { Separator } from '~/components/ui/separator';
import { Toaster } from '~/components/ui/toaster';
import { DEFAULT_LOCALE, translator } from '~/i18n/config';
import { readUsers } from '~/services';

type Subtitle =
  | 'glossaryInspector'
  | 'glossaryImport'
  | 'translation'
  | 'documentInspector'
  | 'paragraphs'
  | 'documents';

function getDataSubtitle(pathname: string): Subtitle | null {
  if (pathname.includes('/glossary/inspector')) return 'glossaryInspector';
  if (pathname.includes('/glossary')) return 'glossaryImport';
  if (pathname.includes('/translation')) return 'translation';
  if (pathname.includes('/inspector')) return 'documentInspector';
  if (pathname.includes('/paragraphs')) return 'paragraphs';
  if (pathname.includes('/documents')) return 'documents';
  return null;
}

export const meta: MetaFunction<unknown, { root: typeof rootLoader }> = ({ location, matches }) => {
  const locale = matches.find((match) => match.id === 'root')?.data?.locale ?? DEFAULT_LOCALE;
  const t = translator(locale);
  const title = t('data:layout.title');
  const subtitle = getDataSubtitle(location.pathname);
  return [{ title: subtitle ? `${title} - ${t(`data:layout.subtitles.${subtitle}`)}` : title }];
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = await assertAuthUser(request);
  if (!user) {
    return redirect('/login');
  }
  // Keeps every /data/* page away from anyone who can maintain neither kind of data, which makes
  // the sidebar hiding this menu meaningful rather than cosmetic. A parent loader does not guard
  // its children's actions, and each page belongs to one kind of data, so every route still gates
  // its own loader and action on the subject it works on.
  const ability = defineAbilityFor(user);
  if (ability.cannot('Maintain', 'GlossaryData') && ability.cannot('Maintain', 'TranslationData')) {
    throw redirect('/dashboard');
  }
  const allUsers = await readUsers();
  return json({
    user,
    users: allUsers.map((user) => ({ id: user.id, username: user.username, email: user.email, avatar: user.avatar })),
  });
};

export default function DataManagementLayout() {
  const { user, users } = useLoaderData<typeof loader>();
  const { pathname } = useLocation();
  const { t } = useTranslation('data');
  const subtitle = getDataSubtitle(pathname);

  return (
    <div className="bg-secondary flex h-auto min-h-screen flex-col px-4">
      <div className="my-2 flex h-10 items-center gap-2 text-xl font-semibold">
        <SideBarTrigger />
        {t('layout.title')}
        {subtitle && (
          <>
            <span className="text-muted-foreground mx-1 font-normal">—</span>
            {t(`layout.subtitles.${subtitle}`)}
          </>
        )}
        <div className="ml-auto">
          <LanguageToggle />
        </div>
      </div>
      <Separator className="mb-2 bg-yellow-600" />
      <Outlet context={{ user, users }} />
      <Toaster />
    </div>
  );
}
