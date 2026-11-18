// /data/glossary/editor opens on its Entries tab.
import { redirect } from '@vercel/remix';

export const loader = () => redirect('/data/glossary/editor/entries');
