import { Outlet, type MetaFunction } from '@remix-run/react';
import { json, type LoaderFunctionArgs } from '@vercel/remix';
import { assertAuthUser } from '../auth.server';
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
    <div className="flex h-screen flex-col gap-4 bg-secondary px-4">
      <div className="h-2"></div>
      <div className="text-2xl font-semibold">Administration</div>
      <Separator className="bg-yellow-600" />
      <Outlet />
      <Toaster />
    </div>
  );
}
