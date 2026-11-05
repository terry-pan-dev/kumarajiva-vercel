import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { auditAtFields, auditByFields } from '../audit';
import { roleEnum } from './enums';
import { teamsTable } from './team';

export const usersTable = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: text('username').notNull(),
  email: text('email').notNull(),
  password: text('password').notNull(),
  role: roleEnum('role').notNull(),
  teamId: uuid('team_id')
    .references(() => teamsTable.id)
    .notNull(),
  firstLogin: boolean('first_login').notNull().default(true),
  avatar: text('avatar'),
  linkValidUntil: timestamp('link_valid_until'),
  ...auditAtFields,
  ...auditByFields,
});

export type ReadUser = typeof usersTable.$inferSelect;
export type CreateUser = typeof usersTable.$inferInsert;
export type UpdateUser = Partial<CreateUser>;
