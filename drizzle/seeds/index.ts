import 'dotenv/config';
import { sql as vercelSql } from '@vercel/postgres';
import * as schema from '~/drizzle/schema';
import { paragraphsTable, referencesTable, rollsTable, sutrasTable, teamsTable, usersTable } from '~/drizzle/tables';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/vercel-postgres';
import algoliaClient from '../../app/providers/algolia';
import { teams } from './0-teams-seed';
import { users } from './1-users-seed';
import { sutras } from './2-sutras-seed';
import { rolls } from './3-rolls-seed';
import { paragraphs } from './4-paragraphs-seed';
import { references } from './5-references-seed';
import { glossaries } from './6-glossaries-seed';

const dbClient = drizzle(vercelSql, { schema });

const main = async () => {
  // clean algolia index
  console.log('clean algolia index');
  await algoliaClient.deleteIndex({ indexName: 'paragraphs' });
  await algoliaClient.deleteIndex({ indexName: 'glossaries' });

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
  const paragraphsResponse = await algoliaClient.saveObjects({
    indexName: 'paragraphs',
    objects: paragraphs.map((paragraph) => ({ id: paragraph.id, content: paragraph.content })),
  });
  const paragraphWithSearchId = paragraphs.map((paragraph, index) => ({
    ...paragraph,
    searchId: paragraphsResponse[0].objectIDs[index],
  }));
  await dbClient.insert(paragraphsTable).values(paragraphWithSearchId).onConflictDoNothing();

  await dbClient.insert(referencesTable).values(references).onConflictDoNothing();
  console.log('seeding references table done');

  console.log('seeding glossaries table');

  const glossariesResponse = await algoliaClient.saveObjects({
    indexName: 'glossaries',
    objects: glossaries.map((glossary) => ({
      id: glossary.id,
      phonetic: glossary.phonetic,
      glossary: glossary.glossary,
      translations: glossary.translations,
    })),
  });
  const glossariesWithSearchId = glossaries.map((glossary, index) => ({
    ...glossary,
    searchId: glossariesResponse[0].objectIDs[index],
  }));
  await dbClient.insert(schema.glossariesTable).values(glossariesWithSearchId).onConflictDoNothing();
  console.log('seeding glossaries table done');
};

main();
