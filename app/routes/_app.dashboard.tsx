import { useOutletContext } from '@remix-run/react';
import { json, type LoaderFunctionArgs } from '@vercel/remix';
import { type ReadUser } from '../../drizzle/tables';
import { assertAuthUser } from '../auth.server';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = await assertAuthUser(request);
  return json({ user });
};

export default function Dashboard() {
  const { user } = useOutletContext<{ user: ReadUser }>();
  console.log('value', user);
  return <div>Dashboard</div>;
}
