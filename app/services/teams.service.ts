import { teamsTable } from '~/drizzle/schema';
import { type CreateTeam, type ReadTeam } from '~/drizzle/tables';
import { getDb } from '~/lib/db.server';

const dbClient = getDb();

export const readTeams = async (): Promise<ReadTeam[]> => {
  return dbClient.query.teamsTable.findMany();
};

export const createTeam = async (team: CreateTeam) => {
  return dbClient.insert(teamsTable).values(team).returning();
};
