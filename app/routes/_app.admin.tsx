import { Outlet, type MetaFunction } from '@remix-run/react';
import { json, redirect, type LoaderFunctionArgs } from '@vercel/remix';

import { assertAuthUser } from '~/auth.server';
import { defineAbilityFor } from '~/authorisation';
import { SideBarTrigger } from '~/components/SideBarTrigger';
import { Separator } from '~/components/ui';
import { Toaster } from '~/components/ui/toaster';

export const meta: MetaFunction = () => {
  return [{ title: 'Administration' }];
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = await assertAuthUser(request);
  if (!user) {
    return redirect('/login');
  }
  // Keeps the admin pages away from anyone else. It does not guard the child route's action,
  // which checks for itself.
  if (defineAbilityFor(user).cannot('Administrate', 'Users')) {
    throw redirect('/dashboard');
  }
  return json({ user });
};

export default function AdminLayout() {
  return (
    <div className="bg-secondary flex h-screen flex-col px-4">
      <div className="my-2 flex h-10 items-center gap-2 text-xl font-semibold">
        <SideBarTrigger />
        Administration
      </div>
      <Separator className="mb-2 bg-yellow-600" />
      <Outlet />
      <Toaster />
    </div>
  );
}
