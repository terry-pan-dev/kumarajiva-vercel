import { Outlet, useLoaderData, useNavigate } from '@remix-run/react';
import { json, type LoaderFunctionArgs } from '@vercel/remix';
import { useEffect } from 'react';
import { assertAuthUser } from '../auth.server';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = await assertAuthUser(request);
  return json({ user });
};

export default function HomeLayout() {
  const navigate = useNavigate();
  const { user } = useLoaderData<typeof loader>();
  useEffect(() => {
    if (user) {
      navigate('/dashboard');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <Outlet />;
}
