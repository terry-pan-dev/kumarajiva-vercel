import { pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { auditAtFields, auditByFields } from '../audit';

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

export type ReadTeam = typeof teamsTable.$inferSelect;
export type CreateTeam = typeof teamsTable.$inferInsert;
export type UpdateTeam = Partial<CreateTeam>;
