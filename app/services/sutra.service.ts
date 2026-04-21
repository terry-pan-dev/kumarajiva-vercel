import type { CreateSutra, ReadUser } from '~/drizzle/tables';

import 'dotenv/config';

import { DbSutras } from './crud.server';

export const readSutrasAndRolls = async () => {
  return DbSutras.findWithRolls();
};

export const getSutra = async (id: string) => {
  return DbSutras.findById(id);
};

export const createTargetSutra = async ({
  originSutraId,
  targetSutra,
}: {
  originSutraId: string;
  targetSutra: Omit<CreateSutra, 'cbeta'>;
}) => {
  const sutra = await DbSutras.findById(originSutraId);
  if (!sutra) {
    throw new Error('Origin sutra not found');
  }
  const { id, ...rest } = sutra;
  return DbSutras.create({
    ...rest,
    ...targetSutra,
  });
};

export const createSutra = async (sutra: Omit<CreateSutra, 'updatedBy' | 'createdBy'>, user: ReadUser) => {
  return DbSutras.create({
    ...sutra,
    updatedBy: user.id,
    createdBy: user.id,
  });
};

export const updateSutra = async (
  id: string,
  data: Partial<Omit<CreateSutra, 'updatedBy' | 'createdBy'>>,
  user: ReadUser,
) => {
  return DbSutras.updateById(id, {
    ...data,
    updatedBy: user.id,
  });
};
