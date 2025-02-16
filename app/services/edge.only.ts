import { sql as vercelSql } from '@vercel/postgres';
import { inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/vercel-postgres';

import * as schema from '~/drizzle/schema';
import { glossariesTable, type ReadGlossary } from '~/drizzle/tables';

import algoliaClient from '../providers/algolia';

const dbClient = drizzle(vercelSql, { schema });

export const searchGlossaries = async (searchTerm: string, limit = 5): Promise<ReadGlossary[]> => {
  const indexExist = await algoliaClient.indexExists({ indexName: 'glossaries' });
  if (!indexExist) {
    return [];
  }
  const { results } = await algoliaClient.search<ReadGlossary>({
    requests: [
      {
        indexName: 'glossaries',
        query: searchTerm.trim(),
        hitsPerPage: limit,
      },
    ],
  });
  if (results.length) {
    if ('hits' in results[0]) {
      console.log('results', results[0]);
      const ids = results[0].hits.map((hit) => hit.id);
      return dbClient.select().from(glossariesTable).where(inArray(glossariesTable.id, ids)).limit(limit);
    }
  }
  return [];
};
