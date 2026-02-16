import { eq } from 'drizzle-orm';

import { referencesTable, type UpdateReference } from '~/drizzle/schema';

import 'dotenv/config';

import { dbClient } from '~/lib/db.server';

export const updateReference = async (reference: UpdateReference) => {
  if (!reference.id) {
    throw new Error('Reference id is required');
  }
  return dbClient.update(referencesTable).set(reference).where(eq(referencesTable.id, reference.id));
};
