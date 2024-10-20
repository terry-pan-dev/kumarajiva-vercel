import { sql as postgresSql } from '@vercel/postgres';
import * as schema from '~/drizzle/schema';
import { sutrasTable, type CreateSutra, type ReadUser } from '~/drizzle/tables';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/vercel-postgres';
import 'dotenv/config';

const dbClient = drizzle(postgresSql, { schema });

export const readSutras = async ({ user }: { user: ReadUser }) => {
  console.log('user.originLang', user.originLang);
  return dbClient.query.sutrasTable.findMany({
    where: eq(sutrasTable.language, user.originLang),
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
