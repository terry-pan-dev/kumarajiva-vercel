import { json, type ActionFunctionArgs } from '@vercel/remix';
import { searchAlgolia } from '../services/paragraph.service';

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const search = formData.get('search') as string;
  if (search) {
    const searchResults = await searchAlgolia(search);
    return json({ success: true, search: searchResults });
  }
  return json({ success: false, search: [] });
};
