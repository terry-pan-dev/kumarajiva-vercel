import 'dotenv/config';
import { Pool } from '@neondatabase/serverless';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-serverless';

import * as schema from '~/drizzle/schema';
import { paragraphsTable, referencesTable, rollsTable, sutrasTable, teamsTable, usersTable } from '~/drizzle/tables';

import algoliaClient from '../../../app/providers/algolia';
import { newTranslationRow } from '../../../app/services/glossary.rows';
import { teams } from './0-teams-seed';
import { users } from './1-users-seed';
import { sutras } from './2-sutras-seed';
import { rolls } from './3-rolls-seed';
import { paragraphs } from './4-paragraphs-seed';
import { references } from './5-references-seed';
import { glossaries } from './6-glossaries-seed';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const dbClient = drizzle(pool, { schema });

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
  // Terms first, then their translations as glossary_translations rows. Only terms this run
  // actually inserted get rows, so seeding twice does not double the translations.
  const glossariesWithSearchId = glossaries.map(({ translations, ...glossary }, index) => {
    void translations;
    return { ...glossary, searchId: glossariesResponse[0].objectIDs[index] };
  });
  const inserted = await dbClient
    .insert(schema.glossariesTable)
    .values(glossariesWithSearchId)
    .onConflictDoNothing()
    .returning({ id: schema.glossariesTable.id });
  const insertedIds = new Set(inserted.map((row) => row.id));
  const translationRows = glossaries
    .filter((glossary) => insertedIds.has(glossary.id))
    .flatMap((glossary) =>
      glossary.translations.map((translation, position) => newTranslationRow(glossary.id, position, translation)),
    );
  if (translationRows.length > 0) {
    await dbClient.insert(schema.glossaryTranslationsTable).values(translationRows);
  }
  console.log('seeding glossaries table done');
  // const glossaries = JSON.parse(fs.readFileSync('drizzle/seeds/dev/glossary.json', 'utf8')) as schema.ReadGlossary[];

  // // split glossaries into 1000 chunks
  // const chunks = _.chunk(glossaries, 1000);
  // for (const chunk of chunks) {
  //   const glossariesResponse = await algoliaClient.saveObjects({
  //     indexName: 'glossaries',
  //     objects: chunk.map((glossary) => ({
  //       id: glossary.id,
  //       // @ts-ignore
  //       phonetic: glossary.phoneticSearchable,
  //       glossary: glossary.glossary,
  //       translations: glossary.translations?.map((translation) => ({
  //         // @ts-ignore
  //         glossary: translation.glossarySearchable,
  //         language: translation.language,
  //       })),
  //     })),
  //   });
  //   const glossariesWithSearchId = chunk.map((glossary, index) => ({
  //     ...glossary,
  //     searchId: glossariesResponse[0].objectIDs[index],
  //   }));
  //   const result = await dbClient
  //     .insert(schema.glossariesTable)
  //     .values(glossariesWithSearchId)
  //     .onConflictDoNothing()
  //     .returning({ glossary: schema.glossariesTable.glossary });
  //   if (result.length !== chunk.length) {
  //     console.log({ chunkLength: chunk.length, resultLength: result.length });
  //   }
  //   // sleep for 1 second
  //   await new Promise((resolve) => setTimeout(resolve, 1000));
  // }
};

main();
