import { asc, eq } from 'drizzle-orm';
import 'dotenv/config';

import { usersTable, type CreateUser, type ReadUser, type UpdateUser } from '~/drizzle/tables';
import { getDb } from '~/lib/db.server';

const dbClient = getDb();

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

// users.origin_lang / target_lang are no longer read anywhere: a project's documents decide the
// languages being translated. The columns are still NOT NULL until a schema change drops them,
// so new users get a fixed placeholder here — the one place to delete when that change lands.
const RETIRED_LANGUAGE_COLUMNS = { originLang: 'chinese', targetLang: 'english' } as const;

export const createUser = async (user: Omit<CreateUser, 'originLang' | 'targetLang'>) => {
  return dbClient
    .insert(usersTable)
    .values({ ...user, ...RETIRED_LANGUAGE_COLUMNS })
    .returning();
};

export const resetUserPassword = async (userId: string, password: string) => {
  return dbClient
    .update(usersTable)
    .set({
      password,
      firstLogin: true,
    })
    .where(eq(usersTable.id, userId));
};
