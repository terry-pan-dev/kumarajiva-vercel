import { eq } from 'drizzle-orm';

import type { CreateRoll } from '~/drizzle/schema';

import 'dotenv/config';

import { type ReadRollWithSutra, rollsTable, type ReadRoll } from '~/drizzle/tables';
import { getDb } from '~/lib/db.server';

const dbClient = getDb();

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
  targetRoll: CreateRoll;
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

export const readRollWithComments = async () => {
  return dbClient.query.commentsTable.findMany({
    where: (comments, { eq }) => eq(comments.resolved, false),
    with: {
      roll: true,
      paragraph: true,
    },
  });
};
