import { sql } from '@vercel/postgres';
import * as schema from '~/drizzle/schema';
import { usersTable, type ReadUser } from '~/drizzle/tables';
import { drizzle } from 'drizzle-orm/vercel-postgres';
import 'dotenv/config';
import { eq } from 'drizzle-orm';

const dbClient = drizzle(sql, { schema });

export const readUserByEmail = async (email: string): Promise<ReadUser | undefined> => {
  return dbClient.query.usersTable.findFirst({
    where: eq(usersTable.email, email),
  });
};
