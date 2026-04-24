import { redirect, type LoaderFunctionArgs } from '@remix-run/node';

import { authenticator, SESSION_USER_KEY } from '~/auth.server';
import { commitSession, getSession } from '~/session.server';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = await authenticator.authenticate('google', request);
  if (user) {
    const session = await getSession(request.headers.get('Cookie'));
    session.set(SESSION_USER_KEY, user);
    return redirect('/dashboard', {
      headers: { 'Set-Cookie': await commitSession(session) },
    });
  }
  return redirect('/auth/failure');
};
