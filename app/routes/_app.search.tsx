import { json, type LoaderFunctionArgs } from '@vercel/remix';

import { searchAlgolia } from '../services/paragraph.service';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const searchTerm = url.searchParams.get('query') as string;
  const searchType = url.searchParams.get('type') as 'Glossary' | 'Paragraph' | null;
  if (searchTerm) {
    console.log({ searchTerm, searchType });
    const searchResults = await searchAlgolia({ searchTerm, searchType });
    return json({ success: true, search: searchResults });
  }
  return json({ success: false, search: [] });
};
