import { createTool } from '@mastra/core';
import { z } from 'zod';

import type { ReadGlossary } from '../../drizzle/tables';

import algoliaClient from '../../app/providers/algolia';

export const glossarySearcherTool = createTool({
  id: 'glossary_searcher',
  description: 'Search the glossary from the database',
  inputSchema: z.object({
    tokens: z.array(z.string()).describe('The tokens or glossaries to search the glossary'),
  }),
  execute: async ({ context }) => {
    const tokens = context.tokens;
    console.log('glossary_searcher started, term:', tokens);
    const glossaries: ReadGlossary[] = [];
    const batchSize = 50;
    const batches = [];
    for (let i = 0; i < tokens.length; i += batchSize) {
      batches.push(tokens.slice(i, i + batchSize));
    }
    const multiSearchQueryBatches = batches.map((batch) => {
      return batch?.map((token) => ({
        indexName: 'glossaries',
        query: token,
        hitsPerPage: 1,
        removeStopWords: true,
      }));
    });
    const indexExist = await algoliaClient.indexExists({ indexName: 'glossaries' });
    if (!indexExist) {
      return [];
    }
    for await (const batch of multiSearchQueryBatches) {
      const { results } = await algoliaClient.search<ReadGlossary>({
        requests: batch,
      });
      if (results.length) {
        results.forEach((result) => {
          if ('hits' in result) {
            result.hits.forEach((hit) => {
              const { _highlightResult, ...rest } = hit;
              console.log('hit', rest);
              glossaries.push(rest);
            });
          }
        });
      }
      console.log('glossary_searcher result', results?.length);
    }
    return glossaries;
  },
});
