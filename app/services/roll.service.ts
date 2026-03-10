import type { CreateRoll } from '~/drizzle/schema';

import 'dotenv/config';

import type { ReadRollWithSutra, ReadRoll, ReadUser } from '~/drizzle/tables';

import { DbComments, DbRolls } from './crud.server';

export const readRolls = async (): Promise<ReadRoll[]> => {
  return DbRolls.findAll();
};

export const readRollById = async (rollId: string): Promise<ReadRollWithSutra | undefined> => {
  return DbRolls.findByIdWithSutra(rollId);
};

export const getRoll = async (id: string) => {
  return DbRolls.findById(id);
};

export const createTargetRoll = async ({
  originRollId,
  targetRoll,
}: {
  originRollId: string;
  targetRoll: CreateRoll;
}) => {
  const roll = await DbRolls.findById(originRollId);
  if (!roll) {
    throw new Error('Origin roll not found');
  }
  const { id, ...rest } = roll;
  return DbRolls.create({
    ...rest,
    ...targetRoll,
  });
};

export const readRollWithComments = async () => {
  return DbComments.findAllUnresolvedWithRollParagraph();
};

export const createRoll = async (roll: Omit<CreateRoll, 'updatedBy' | 'createdBy'>, user: ReadUser) => {
  return DbRolls.create({ ...roll, updatedBy: user.id, createdBy: user.id });
};

export const updateRoll = async (
  id: string,
  data: Partial<Omit<CreateRoll, 'updatedBy' | 'createdBy'>>,
  user: ReadUser,
) => {
  return DbRolls.updateById(id, { ...data, updatedBy: user.id });
};
