import type { LoaderFunctionArgs } from '@remix-run/node';

import { redirect } from '@remix-run/node';

import { assertAuthUser } from '~/auth.server';
import { defineAbilityFor } from '~/authorisation';
import { glossaryDownloadResponse, parseExportFormat } from '~/services/glossary.export';
import { getAllGlossaries } from '~/services/glossary.service';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = await assertAuthUser(request);
  if (!user) {
    return redirect('/login');
  }
  if (defineAbilityFor(user).cannot('Download', 'Glossary')) {
    throw redirect('/data/glossary');
  }
  const format = parseExportFormat(new URL(request.url).searchParams.get('format'));
  const glossaries = await getAllGlossaries();
  return glossaryDownloadResponse(glossaries, format);
};
