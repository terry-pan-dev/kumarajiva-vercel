import { sql } from '@vercel/postgres';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/vercel-postgres';

import * as schema from '~/drizzle/schema';

import 'dotenv/config';

import { type ReadRollWithSutra, rollsTable, type ReadRoll, type CreateRoll } from '~/drizzle/tables';

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

export const readRollWithComments = async () => {
  return dbClient.query.commentsTable.findMany({
    where: (comments, { eq }) => eq(comments.resolved, false),
    with: {
      roll: true,
      paragraph: true,
    },
  });
};

export const createRoll = async (roll: Omit<CreateRoll, 'updatedBy' | 'createdBy'>, userId: string) => {
  return dbClient
    .insert(rollsTable)
    .values({
      ...roll,
      updatedBy: userId,
      createdBy: userId,
    })
    .returning();
};

export const getAllRolls = async () => {
  return dbClient.query.rollsTable.findMany({
    orderBy: (rolls, { asc }) => [asc(rolls.title)],
    with: {
      sutra: true,
    },
  });
};

export const getRollsBySutraId = async (sutraId: string) => {
  return dbClient.query.rollsTable.findMany({
    where: eq(rollsTable.sutraId, sutraId),
    orderBy: (rolls, { asc }) => [asc(rolls.title)],
    with: {
      sutra: true,
    },
  });
};
