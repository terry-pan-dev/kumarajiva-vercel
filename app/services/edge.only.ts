import { and, inArray, isNull } from 'drizzle-orm';

import { glossariesTable, type ReadGlossary } from '~/drizzle/tables';
import { getDb } from '~/lib/db.server';
import algoliaClient from '~/providers/algolia';

const dbClient = getDb();

// Headroom for the query: index records can outnumber entries, so ask for more hits than
// needed and collapse duplicates afterwards.
const HIT_OVERFETCH = 3;

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
        hitsPerPage: limit * HIT_OVERFETCH,
      },
    ],
  });
  if (results.length) {
    if ('hits' in results[0]) {
      // One entry can be reachable through several index records — duplicates left by earlier
      // imports. Collapsing on the uuid stops the same entry rendering as two identical cards
      // that both edit the same row.
      const ids = [...new Set(results[0].hits.map((hit) => hit.id))].slice(0, limit);
      const dbResults = await dbClient
        .select()
        .from(glossariesTable)
        .where(and(inArray(glossariesTable.id, ids), isNull(glossariesTable.deletedAt)))
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
