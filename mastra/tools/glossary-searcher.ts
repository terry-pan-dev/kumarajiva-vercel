import { createTool } from '@mastra/core';
import { z } from 'zod';

import { searchGlossaries } from '../../app/services/edge.only';

export const glossarySearcherTool = createTool({
  id: 'glossary_searcher',
  description: 'Search the glossary from the database',
  inputSchema: z.object({
    text: z.string().describe('The text to search the glossary'),
  }),
  execute: async ({ context }) => {
    const searchTerm = context.text;
    console.log('glossary_searcher started, term:', searchTerm);
    const result = await searchGlossaries(searchTerm, 5);
    console.log('glossary_searcher result', result);
    return result;
  },
});
