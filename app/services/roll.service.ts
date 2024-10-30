import { sql } from '@vercel/postgres';
import * as schema from '~/drizzle/schema';
import { rollsTable, type ReadRoll } from '~/drizzle/tables';
import { drizzle } from 'drizzle-orm/vercel-postgres';
import 'dotenv/config';
import { eq } from 'drizzle-orm';

const dbClient = drizzle(sql, { schema });

export const readRolls = async (): Promise<ReadRoll[]> => {
  return dbClient.query.rollsTable.findMany();
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
