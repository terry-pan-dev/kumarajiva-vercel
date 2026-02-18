import { json, redirect, type ActionFunctionArgs } from '@remix-run/node';

import { assertAuthUser } from '~/auth.server';
import { getGlossariesByGivenGlossaries } from '~/services/glossary.service';
import { tokenizer } from '~/services/tokenizer.service';

export const loader = async ({ request }: ActionFunctionArgs) => {
  const user = await assertAuthUser(request);
  if (!user) {
    return redirect('/login');
  }

  const url = new URL(request.url);
  const content = url.searchParams.get('content');
  if (!content) {
    return json({ success: false, glossaries: [], tokens: [] });
  }

  const tokens = await tokenizer(content);
  const glossaries = await getGlossariesByGivenGlossaries(tokens);
  return json({ success: true, glossaries, tokens });
};
