import { inArray } from 'drizzle-orm';

import { glossariesTable, type ReadGlossary } from '~/drizzle/tables';
import { dbClient } from '~/lib/db.server';
import algoliaClient from '~/providers/algolia';

export const searchGlossaries = async (searchTerm: string, limit = 10): Promise<ReadGlossary[]> => {
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
      const ids = results[0].hits.map((hit) => hit.id);
      const dbResults = await dbClient
        .select()
        .from(glossariesTable)
        .where(inArray(glossariesTable.id, ids))
        .limit(limit);
      // reorder the results based on the ids and filter out undefined values
      const reorderedResults = ids
        .map((id) => dbResults.find((result) => result.id === id))
        .filter((result): result is ReadGlossary => result !== undefined); // Type guard to ensure result is ReadGlossary
      return reorderedResults;
    }
  }
  return [];
};
