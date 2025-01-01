import { Outlet, type MetaFunction } from '@remix-run/react';
import { json, type LoaderFunctionArgs } from '@vercel/remix';

import { assertAuthUser } from '../auth.server';
import { SideBarTrigger } from '../components/SideBarTrigger';
import { Separator } from '../components/ui';
import { Toaster } from '../components/ui/toaster';

export const meta: MetaFunction = () => {
  return [{ title: 'Administration' }];
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = await assertAuthUser(request);
  return json({ user });
};

export default function AdminLayout() {
  return (
    <div className="flex h-screen flex-col bg-secondary px-4">
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
