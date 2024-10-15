import { Outlet } from '@remix-run/react';
import { json, type LoaderFunctionArgs } from '@vercel/remix';
import { assertAuthUser } from '../auth.server';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = await assertAuthUser(request);
  return json({ user });
};

export default function HomeLayout() {
  return <Outlet />;
}
