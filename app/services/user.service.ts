import { sql } from '@vercel/postgres';
import * as schema from '~/drizzle/schema';
import { usersTable, type CreateUser, type ReadUser, type UpdateUser } from '~/drizzle/tables';
import { drizzle } from 'drizzle-orm/vercel-postgres';
import 'dotenv/config';
import { asc, eq } from 'drizzle-orm';

const dbClient = drizzle(sql, { schema });

export const readUserByEmail = async (email: string): Promise<ReadUser | undefined> => {
  return dbClient.query.usersTable.findFirst({
    where: eq(usersTable.email, email),
  });
};

export const readUsers = async (): Promise<ReadUser[]> => {
  return dbClient.query.usersTable.findMany({
    orderBy: asc(usersTable.username),
  });
};

export const updateUser = async (user: UpdateUser) => {
  if (!user.id) {
    throw new Error('User id is required');
  }
  return dbClient.update(usersTable).set(user).where(eq(usersTable.id, user.id));
};

export const createUser = async (user: CreateUser) => {
  return dbClient.insert(usersTable).values(user).returning();
};
