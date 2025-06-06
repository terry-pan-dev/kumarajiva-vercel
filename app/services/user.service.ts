import { sql } from '@vercel/postgres';
import { asc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/vercel-postgres';

import * as schema from '~/drizzle/schema';

import 'dotenv/config';

import { usersTable, type CreateUser, type ReadUser, type UpdateUser } from '~/drizzle/tables';

const dbClient = drizzle(sql, { schema });

export const readUserByEmail = async (email: string): Promise<ReadUser | undefined> => {
  return dbClient.query.usersTable.findFirst({
    where: eq(usersTable.email, email),
  });
};

export const updateUserPassword = async (user: UpdateUser) => {
  if (!user.email) {
    throw new Error('User email is required');
  }
  return dbClient
    .update(usersTable)
    .set({
      ...user,
      firstLogin: false,
    })
    .where(eq(usersTable.email, user.email));
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
