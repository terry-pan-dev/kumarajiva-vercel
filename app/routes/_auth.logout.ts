import { redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from '@vercel/remix';
import { assertAuthUser } from '~/auth.server';
import { authenticator } from '~/authenticator';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = await assertAuthUser(request);
  if (user) {
    return redirect('/');
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  console.log('logout');
  await authenticator.logout(request, { redirectTo: '/login' });
};
