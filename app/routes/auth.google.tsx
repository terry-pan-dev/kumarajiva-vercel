import type { ActionFunctionArgs } from '@remix-run/node';

import { authenticator } from '~/auth.server';

export const action = ({ request }: ActionFunctionArgs) => {
  return authenticator.authenticate('google', request);
};
