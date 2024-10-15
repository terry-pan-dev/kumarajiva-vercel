import { relations } from 'drizzle-orm';
import { boolean, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { auditAtFields, auditByFields } from '../audit';
import { teamsTable } from './team';

export const langEnum = pgEnum('lang', ['english', 'chinese', 'sanskrit', 'indonesian']);

export const roleEnum = pgEnum('roles', ['admin', 'leader', 'editor', 'reader', 'assistant', 'manager']);

export const usersTable = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: text('username').notNull(),
  email: text('email').notNull(),
  password: text('password').notNull(),
  role: roleEnum('role').notNull(),
  teamId: uuid('team_id')
    .references(() => teamsTable.id)
    .notNull(),
  originLang: langEnum('origin_lang').notNull(),
  targetLang: langEnum('target_lang').notNull(),
  firstLogin: boolean('first_login').notNull().default(true),
  avatar: text('avatar'),
  linkValidUntil: timestamp('link_valid_until'),
  ...auditAtFields,
  ...auditByFields,
});

export const usersTableRelations = relations(usersTable, ({ one }) => ({
  team: one(teamsTable, {
    fields: [usersTable.teamId],
    references: [teamsTable.id],
  }),
}));

export type ReadUser = typeof usersTable.$inferSelect;
export type CreateUser = typeof usersTable.$inferInsert;
export type UpdateUser = Partial<CreateUser>;
