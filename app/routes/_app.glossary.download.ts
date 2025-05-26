import type { LoaderFunctionArgs } from '@remix-run/node';

import { redirect } from '@remix-run/node';

import { assertAuthUser } from '../auth.server';
import { getAllGlossaries } from '../services/glossary.service';

function escapeCSVValue(value: unknown): string {
  if (value == null) return ''; // handle null or undefined

  const str = String(value);

  const shouldQuote = /[",\n]/.test(str);
  const escaped = str.replace(/"/g, '""');

  return shouldQuote ? `"${escaped}"` : escaped;
}

function generateCSV(data: Record<string, unknown>[]): string {
  if (data.length === 0) return '';

  const headers = Object.keys(data[0]);
  const csvRows = [
    headers.join(','), // Header row
    ...data.map((row) => headers.map((header) => escapeCSVValue(row[header])).join(',')),
  ];

  return csvRows.join('\n');
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = await assertAuthUser(request);
  if (!user) {
    return redirect('/login');
  }
  const glossaries = await getAllGlossaries();
  const reformedGlossaries = glossaries.reduce((acc, glossary) => {
    const { translations } = glossary;
    const glossaries = translations?.map((translation) => ({
      UUID: glossary.id,
      ChineseTerm: glossary.glossary,
      EnglishTerm: translation.glossary,
      ChineseSutraText: translation.originSutraText,
      EnglishSutraText: translation.targetSutraText,
      SutraName: translation.sutraName,
      Volume: translation.volume,
      CBetaFrequency: glossary.cbetaFrequency,
      Author: translation.author,
      Phonetic: glossary.phonetic,
    }));
    // @ts-ignore
    acc.push(...glossaries);
    return acc;
  }, []);
  const csv = generateCSV(reformedGlossaries);
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="glossary.csv"',
    },
  });
};
