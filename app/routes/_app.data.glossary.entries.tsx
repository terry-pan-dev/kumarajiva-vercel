// The entry editor's former address (step 4), kept for bookmarks: it is now the Entries tab of
// the Glossary Editor. The query (?q=, ?id=) goes with it.
import { redirect, type LoaderFunctionArgs } from '@vercel/remix';

export const loader = ({ request }: LoaderFunctionArgs) =>
  redirect(`/data/glossary/editor/entries${new URL(request.url).search}`, 301);
