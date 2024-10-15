import { sql } from '@vercel/postgres';
import * as schema from '~/drizzle/schema';
import { glossariesTable, type CreateGlossary, type ReadGlossary } from '~/drizzle/tables';
import { drizzle } from 'drizzle-orm/vercel-postgres';
import 'dotenv/config';

const dbClient = drizzle(sql, { schema });

export type Pagination = {
  skip: number;
  take: number;
};

export const readGlossaries = async ({ skip, take }: Pagination): Promise<ReadGlossary[]> => {
  return dbClient.query.glossariesTable.findMany({
    limit: take,
    offset: skip,
  });
};

export const createGlossary = async (glossary: Omit<CreateGlossary, 'searchId' | 'updatedBy' | 'createdBy'>) => {
  return dbClient.insert(glossariesTable).values({
    ...glossary,
    searchId: '5eefc822-fadf-4e8d-892b-0a3badef4282',
    updatedBy: '5eefc822-fadf-4e8d-892b-0a3badef4282',
    createdBy: '5eefc822-fadf-4e8d-892b-0a3badef4282',
  });
};
