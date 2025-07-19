import { json, type LoaderFunctionArgs } from '@vercel/remix';

import { assertAuthUser } from '../auth.server';
import { getAllSutrasWithRolls } from '../services/sutra.service';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = await assertAuthUser(request);
  if (!user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const sutras = await getAllSutrasWithRolls();
    return json(sutras);
  } catch (error) {
    console.error('Failed to fetch sutras with rolls:', error);
    return json({ error: 'Failed to fetch sutras' }, { status: 500 });
  }
};
