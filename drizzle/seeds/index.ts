import 'dotenv/config';
import { sql as vercelSql } from '@vercel/postgres';
import * as schema from '~/drizzle/schema';
import { paragraphsTable, referencesTable, rollsTable, sutrasTable, teamsTable, usersTable } from '~/drizzle/tables';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/vercel-postgres';
import { teams } from './0-teams-seed';
import { users } from './1-users-seed';
import { sutras } from './2-sutras-seed';
import { rolls } from './3-rolls-seed';
import { paragraphs } from './4-paragraphs-seed';
import { references } from './5-references-seed';

const dbClient = drizzle(vercelSql, { schema });

const main = async () => {
  // seed teams table
  console.log('enable extension vector');
  await dbClient.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
  console.log('enable extension vector done');

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
  await dbClient
    .insert(sutrasTable)
    .values(sutras as any)
    .onConflictDoNothing();
  console.log('seeding sutras table done');
  // seed rolls table
  console.log('seeding rolls table');
  await dbClient
    .insert(rollsTable)
    .values(rolls)
    .onConflictDoUpdate({
      target: rollsTable.id,
      set: {
        parentId: sql.raw(`excluded.${rollsTable.parentId.name}`),
      },
    });
  console.log('seeding rolls table done');
  // seed paragraphs table
  console.log('seeding paragraphs table');
  await dbClient
    .insert(paragraphsTable)
    .values(paragraphs)
    .onConflictDoUpdate({
      target: paragraphsTable.id,
      set: {
        order: sql.raw(`excluded.${paragraphsTable.order.name}`),
        updatedBy: 'd2e3bb43-cb01-4673-81ed-20fd4b5acfc9',
      },
    });
  console.log('seeding paragraphs table done');

  await dbClient
    .insert(referencesTable)
    .values(references)
    .onConflictDoUpdate({
      target: referencesTable.id,
      set: {
        order: sql.raw(`excluded.${referencesTable.order.name}`),
        updatedBy: 'd2e3bb43-cb01-4673-81ed-20fd4b5acfc9',
      },
    });
  console.log('seeding references table done');
};

main();
