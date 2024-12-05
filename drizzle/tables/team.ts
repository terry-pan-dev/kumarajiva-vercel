import { relations } from 'drizzle-orm';
import { pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { auditAtFields, auditByFields } from '../audit';
import { sutrasTable } from './sutra';
import { usersTable } from './user';

export const teamsTable = pgTable('teams', {
  id: uuid('id').primaryKey().defaultRandom(),
  /**
   * The name of the team, Like Team 1, Team 2, etc.
   */
  name: text('name').notNull(),
  /**
   * The alias of the team, Like Master Sure, Master Lai, etc.
   */
  alias: text('alias'),
  ...auditAtFields,
  ...auditByFields,
});

export const teamsTableRelations = relations(teamsTable, ({ many }) => ({
  sutras: many(sutrasTable),
  users: many(usersTable),
}));

export type ReadTeam = typeof teamsTable.$inferSelect;
export type CreateTeam = typeof teamsTable.$inferInsert;
export type UpdateTeam = Partial<CreateTeam>;
