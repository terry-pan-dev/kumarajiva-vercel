import { Outlet, redirect } from '@remix-run/react';
import { json, type LoaderFunctionArgs } from '@vercel/remix';

import { assertAuthUser } from '~/auth.server';
import { Toaster } from '~/components/ui/toaster';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // this will make sure user is authenticated first, if not, inside this
  // function, it will redirect to login page. If logged in, it will go
  // to _app.tsx first
  const user = await assertAuthUser(request);
  if (user) {
    return redirect('/dashboard');
  }
  return json({});
};

export default function HomeLayout() {
  return (
    <div>
      <Outlet />
      <Toaster />
    </div>
  );
}
