import type { LoaderFunctionArgs, MetaFunction } from '@vercel/remix';

import { json, Outlet, redirect, useLoaderData } from '@remix-run/react';

import { assertAuthUser } from '~/auth.server';
import { SideBarTrigger } from '~/components/SideBarTrigger';
import { Separator } from '~/components/ui/separator';
import { readUsers } from '~/services';

export const meta: MetaFunction = () => {
  return [{ title: 'Data Management' }];
};

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
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
  return (
    <div className="flex h-auto min-h-screen flex-col bg-secondary px-4">
      <div className="my-2 flex h-10 items-center gap-2 text-xl font-semibold">
        <SideBarTrigger />
        Data Management
      </div>
      <Separator className="mb-2 bg-yellow-600" />
      <Outlet context={{ user, users }} />
    </div>
  );
}
