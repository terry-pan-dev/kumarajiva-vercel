import { sql } from '@vercel/postgres';
import * as schema from '~/drizzle/schema';
import { type ReadRoll } from '~/drizzle/tables';
import { drizzle } from 'drizzle-orm/vercel-postgres';
import 'dotenv/config';

const dbClient = drizzle(sql, { schema });

export const readRolls = async (): Promise<ReadRoll[]> => {
  return dbClient.query.rollsTable.findMany();
};
