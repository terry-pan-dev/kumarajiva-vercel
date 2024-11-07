import type { LoaderFunctionArgs } from '@remix-run/node';
import { authenticator } from '~/auth.server';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  console.log('2', request.url);
  const value = await authenticator.authenticate('google', request, {
    successRedirect: '/dashboard',
    failureRedirect: '/auth/failure',
  });
  console.log('4', value);
  return value;
};
