import type { LoaderFunctionArgs } from '@remix-run/node';

import { redirect } from '@remix-run/node';

import { assertAuthUser } from '~/auth.server';
import { defineAbilityFor } from '~/authorisation';

// Lands on the first section the user can maintain. The /data layout has already turned away
// anyone who can maintain neither.
export async function loader({ request }: LoaderFunctionArgs) {
  const user = await assertAuthUser(request);
  if (!user) {
    return redirect('/login');
  }
  return redirect(defineAbilityFor(user).can('Maintain', 'TranslationData') ? '/data/translation' : '/data/glossary');
}
