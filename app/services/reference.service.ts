import type { UpdateReference } from '~/drizzle/schema';

import 'dotenv/config';

import { DbReferences } from './crud.server';

export const updateReference = async (reference: UpdateReference) => {
  if (!reference.id) {
    throw new Error('Reference id is required');
  }
  const { id, ...rest } = reference;

  return DbReferences.updateById(id, {
    ...rest,
    updatedAt: new Date(),
  });
};
