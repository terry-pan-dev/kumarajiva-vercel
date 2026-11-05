import algoliaClient from '~/providers/algolia';

import { GlossaryStore } from './glossary.store';
import { type GlossaryEntry } from './glossary.types';

// Headroom for the query: index records can outnumber entries, so ask for more hits than
// needed and collapse duplicates afterwards.
const HIT_OVERFETCH = 3;

export const searchGlossaries = async (searchTerm: string, limit = 10): Promise<GlossaryEntry[]> => {
  const indexExist = await algoliaClient.indexExists({ indexName: 'glossaries' });
  if (!indexExist) {
    return [];
  }
  const { results } = await algoliaClient.search<{ id: string }>({
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
      return GlossaryStore.findByIdsInOrder(ids);
    }
  }
  return [];
};
