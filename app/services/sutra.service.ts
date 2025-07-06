import { sql as postgresSql } from '@vercel/postgres';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/vercel-postgres';

import * as schema from '~/drizzle/schema';
import { sutrasTable, type CreateSutra, type ReadUser } from '~/drizzle/tables';

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
  targetSutra: Omit<CreateSutra, 'cbeta'>;
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

export const createSutra = async (
  sutra: Omit<CreateSutra, 'updatedBy' | 'createdBy' | 'teamId'>,
  teamId: string,
  userId: string,
) => {
  return dbClient
    .insert(sutrasTable)
    .values({
      ...sutra,
      teamId,
      updatedBy: userId,
      createdBy: userId,
    })
    .returning();
};

export const getAllSutras = async () => {
  return dbClient.query.sutrasTable.findMany({
    orderBy: (sutras, { asc }) => [asc(sutras.title)],
  });
};

export const getSutrasWithRolls = async ({ teamId }: { teamId: string }) => {
  return dbClient.query.sutrasTable.findMany({
    where: eq(sutrasTable.teamId, teamId),
    with: {
      rolls: {
        orderBy: (rolls, { asc }) => [asc(rolls.title)],
      },
    },
    orderBy: (sutras, { asc }) => [asc(sutras.title)],
  });
};
