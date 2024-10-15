import { sql } from '@vercel/postgres';
import * as schema from '~/drizzle/schema';
import { sutrasTable, type CreateSutra } from '~/drizzle/tables';
import { drizzle } from 'drizzle-orm/vercel-postgres';
import 'dotenv/config';

const dbClient = drizzle(sql, { schema });

export type Pagination = {
  skip: number;
  take: number;
};

export const readSutras = async ({ skip, take }: Pagination) => {
  return dbClient.query.sutrasTable.findMany({
    with: {
      rolls: true,
    },
  });
};

export const createSutra = async (sutra: Omit<CreateSutra, 'updatedBy' | 'createdBy'>) => {
  return dbClient.insert(sutrasTable).values({
    ...sutra,
    updatedBy: '5eefc822-fadf-4e8d-892b-0a3badef4282',
    createdBy: '5eefc822-fadf-4e8d-892b-0a3badef4282',
  });
};
