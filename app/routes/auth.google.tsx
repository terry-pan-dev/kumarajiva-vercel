import { redirect, type ActionFunctionArgs } from '@remix-run/node';

import { authenticator } from '~/auth.server';

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    return await authenticator.authenticate('google', request);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('Google OAuth initiation error:', error);
    return redirect('/auth/failure');
  }
};
