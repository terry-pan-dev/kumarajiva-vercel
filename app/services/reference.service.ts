import { sql as postgresql } from '@vercel/postgres';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/vercel-postgres';

import { referencesTable, type UpdateReference } from '~/drizzle/schema';

import 'dotenv/config';

import * as schema from '~/drizzle/schema';

const dbClient = drizzle(postgresql, { schema });

export const updateReference = async (reference: UpdateReference) => {
  if (!reference.id) {
    throw new Error('Reference id is required');
  }
  return dbClient.update(referencesTable).set(reference).where(eq(referencesTable.id, reference.id));
};
