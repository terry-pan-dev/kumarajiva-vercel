import 'dotenv/config';
import { sql } from '@vercel/postgres';
import * as schema from '~/drizzle/schema';
import { paragraphsTable, rollsTable, sutrasTable, teamsTable, usersTable } from '~/drizzle/tables';
import { drizzle } from 'drizzle-orm/vercel-postgres';
import { teams } from './0-teams-seed';
import { users } from './1-users-seed';
import { sutras } from './2-sutras-seed';
import { rolls } from './3-rolls-seed';
import { paragraphs } from './4-paragraphs-seed';

const dbClient = drizzle(sql, { schema });

const main = async () => {
  // seed teams table
  console.log('seeding teams table');
  await dbClient.insert(teamsTable).values(teams).onConflictDoNothing();
  console.log('seeding teams table done');
  // seed users table
  console.log('seeding users table');
  await dbClient
    .insert(usersTable)
    .values(users as any)
    .onConflictDoNothing();
  console.log('seeding users table done');
  // seed sutras table
  console.log('seeding sutras table');
  await dbClient.insert(sutrasTable).values(sutras).onConflictDoNothing();
  console.log('seeding sutras table done');
  // seed rolls table
  console.log('seeding rolls table');
  await dbClient.insert(rollsTable).values(rolls).onConflictDoNothing();
  console.log('seeding rolls table done');
  // seed paragraphs table
  console.log('seeding paragraphs table');
  await dbClient.insert(paragraphsTable).values(paragraphs).onConflictDoNothing();
  console.log('seeding paragraphs table done');
};

main();
