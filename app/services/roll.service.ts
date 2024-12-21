import { sql } from '@vercel/postgres';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/vercel-postgres';

import * as schema from '~/drizzle/schema';

import 'dotenv/config';

import { type ReadRollWithSutra, rollsTable, type ReadRoll } from '~/drizzle/tables';

const dbClient = drizzle(sql, { schema });

export const readRolls = async (): Promise<ReadRoll[]> => {
  return dbClient.query.rollsTable.findMany();
};

export const readRollById = async (rollId: string): Promise<ReadRollWithSutra | undefined> => {
  return dbClient.query.rollsTable.findFirst({
    where: eq(rollsTable.id, rollId),
    with: {
      sutra: true,
    },
  });
};

export const createTargetRoll = async ({
  originRollId,
  targetRoll,
}: {
  originRollId: string;
  targetRoll: schema.CreateRoll;
}) => {
  const roll = await dbClient.query.rollsTable.findFirst({
    where: eq(rollsTable.id, originRollId),
  });
  if (!roll) {
    throw new Error('Origin roll not found');
  }
  const { id, ...rest } = roll;
  return dbClient.insert(rollsTable).values({
    ...rest,
    ...targetRoll,
  });
};
