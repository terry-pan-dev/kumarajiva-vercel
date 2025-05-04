import type { MetaFunction } from '@remix-run/react';
import type { LoaderFunctionArgs } from '@vercel/remix';

import { json, Outlet, useLoaderData } from '@remix-run/react';

import { assertAuthUser } from '../auth.server';
import { SideBarTrigger } from '../components/SideBarTrigger';
import { Separator } from '../components/ui/separator';
import { readUsers } from '../services/user.service';

export const meta: MetaFunction = () => {
  return [{ title: 'Assistant' }];
};
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = await assertAuthUser(request);
  const users = await readUsers();
  return json({ user, users: users.map((user) => ({ id: user.id, username: user.username, email: user.email })) });
};

export default function AssistantLayout() {
  const { user } = useLoaderData<typeof loader>();
  return (
    <div className="flex h-auto min-h-screen flex-col bg-secondary px-4">
      <div className="my-2 flex h-10 items-center gap-2 text-xl font-semibold">
        <SideBarTrigger />
        Assistant
      </div>
      <Separator className="mb-4 bg-yellow-600" />
      <Outlet context={{ user }} />
    </div>
  );
}
