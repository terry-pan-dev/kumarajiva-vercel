import type { LoaderFunctionArgs, MetaFunction } from '@vercel/remix';

import { json, Outlet, redirect, useLoaderData, useLocation } from '@remix-run/react';

import { assertAuthUser } from '~/auth.server';
import { SideBarTrigger } from '~/components/SideBarTrigger';
import { Separator } from '~/components/ui/separator';
import { Toaster } from '~/components/ui/toaster';
import { readUsers } from '~/services';

function getDataSubtitle(pathname: string): string {
  if (pathname.includes('/glossary')) return 'Glossary';
  if (pathname.includes('/translation')) return 'Translation';
  return '';
}

export const meta: MetaFunction = ({ location }) => {
  const subtitle = getDataSubtitle(location.pathname);
  return [{ title: subtitle ? `Data Management - ${subtitle}` : 'Data Management' }];
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = await assertAuthUser(request);
  if (!user) {
    return redirect('/login');
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
  const subtitle = getDataSubtitle(pathname);

  return (
    <div className="bg-secondary flex h-auto min-h-screen flex-col px-4">
      <div className="my-2 flex h-10 items-center gap-2 text-xl font-semibold">
        <SideBarTrigger />
        Data Management
        {subtitle && (
          <>
            <span className="text-muted-foreground mx-1 font-normal">—</span>
            {subtitle}
          </>
        )}
      </div>
      <Separator className="mb-2 bg-yellow-600" />
      <Outlet context={{ user, users }} />
      <Toaster />
    </div>
  );
}
