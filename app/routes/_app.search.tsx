import { json, type LoaderFunctionArgs } from '@vercel/remix';
import { searchAlgolia } from '../services/paragraph.service';

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const search = url.searchParams.get('query') as string;
  if (search) {
    const searchResults = await searchAlgolia(search);
    return json({ success: true, search: searchResults });
  }
  return json({ success: false, search: [] });
};
