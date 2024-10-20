import { sql } from '@vercel/postgres';
import * as schema from '~/drizzle/schema';
import { type CreateTeam, type ReadTeam } from '~/drizzle/tables';
import { drizzle } from 'drizzle-orm/vercel-postgres';

const dbClient = drizzle(sql, { schema });

export const readTeams = async (): Promise<ReadTeam[]> => {
  console.log('readTeams');
  return dbClient.query.teamsTable.findMany();
};

export const createTeam = async (team: CreateTeam) => {
  return dbClient.insert(schema.teamsTable).values(team).returning();
};
