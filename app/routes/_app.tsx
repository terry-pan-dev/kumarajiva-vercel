import { Outlet, useLoaderData } from '@remix-run/react';
import { json, type LoaderFunctionArgs } from '@vercel/remix';
import { assertAuthUser } from '../auth.server';
import { SideBarMenu } from '../components/SideBarMenu';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = await assertAuthUser(request);
  return json({ user });
};

export default function AppLayout() {
  const { user } = useLoaderData<typeof loader>();

  if (!user) {
    return <Outlet />;
  }

  return (
    <div className="flex h-screen">
      <SideBarMenu userName={user.username} userEmail={user.email} userRole={user.role} avatarSrc={user.avatar} />
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
