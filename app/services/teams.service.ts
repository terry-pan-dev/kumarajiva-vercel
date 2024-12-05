import { sql } from '@vercel/postgres';
import { drizzle } from 'drizzle-orm/vercel-postgres';

import * as schema from '~/drizzle/schema';
import { type CreateTeam, type ReadTeam } from '~/drizzle/tables';

const dbClient = drizzle(sql, { schema });

export const readTeams = async (): Promise<ReadTeam[]> => {
  return dbClient.query.teamsTable.findMany();
};

export const createTeam = async (team: CreateTeam) => {
  return dbClient.insert(schema.teamsTable).values(team).returning();
};
