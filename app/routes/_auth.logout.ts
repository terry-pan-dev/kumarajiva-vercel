import { redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from '@vercel/remix';

import { assertAuthUser } from '~/auth.server';
import { destroySession, getSession } from '~/session.server';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = await assertAuthUser(request);
  if (user) {
    return redirect('/');
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  console.log('logout');
  const session = await getSession(request.headers.get('Cookie'));
  return redirect('/login', {
    headers: { 'Set-Cookie': await destroySession(session) },
  });
};
