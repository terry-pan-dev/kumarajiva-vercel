import type { LoaderFunctionArgs } from '@remix-run/node';

import { json } from '@remix-run/node';

import { getRollsBySutraId } from '~/services/roll.service';

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const sutraId = url.searchParams.get('sutraId');

  if (!sutraId) {
    return json({ error: 'sutraId is required' }, { status: 400 });
  }

  try {
    const chapters = await getRollsBySutraId(sutraId);
    return json(chapters);
  } catch (error) {
    console.error('Error fetching chapters:', error);
    return json({ error: 'Failed to fetch chapters' }, { status: 500 });
  }
}
