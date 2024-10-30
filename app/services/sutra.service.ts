import { sql as postgresSql } from '@vercel/postgres';
import * as schema from '~/drizzle/schema';
import { sutrasTable, type CreateSutra, type ReadUser } from '~/drizzle/tables';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/vercel-postgres';
import 'dotenv/config';

const dbClient = drizzle(postgresSql, { schema });

export const readSutrasAndRolls = async ({ user }: { user: ReadUser }) => {
  return dbClient.query.sutrasTable.findMany({
    where: eq(sutrasTable.language, user.originLang),
    with: {
      rolls: {
        with: {
          children: true,
        },
      },
      children: true,
    },
  });
};

export const createTargetSutra = async ({
  originSutraId,
  targetSutra,
}: {
  originSutraId: string;
  targetSutra: CreateSutra;
}) => {
  const sutra = await dbClient.query.sutrasTable.findFirst({
    where: eq(sutrasTable.id, originSutraId),
  });
  if (!sutra) {
    throw new Error('Origin sutra not found');
  }
  const { id, ...rest } = sutra;
  return dbClient.insert(sutrasTable).values({
    ...rest,
    ...targetSutra,
  });
};

export const createSutra = async (sutra: Omit<CreateSutra, 'updatedBy' | 'createdBy'>) => {
  return dbClient.insert(sutrasTable).values({
    ...sutra,
    updatedBy: '5eefc822-fadf-4e8d-892b-0a3badef4282',
    createdBy: '5eefc822-fadf-4e8d-892b-0a3badef4282',
  });
};
