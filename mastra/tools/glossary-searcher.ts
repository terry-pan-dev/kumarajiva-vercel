import { createTool } from '@mastra/core';
import { z } from 'zod';

import { searchGlossaries } from '../../app/services/glossary.service';

export const glossarySearcherTool = createTool({
  id: 'glossary_searcher',
  description: 'Search the glossary from the database',
  inputSchema: z.object({
    tokens: z.array(z.string()).describe('The tokens or glossaries to search the glossary'),
  }),
  execute: async ({ context }) => {
    const tokens = context.tokens;
    console.log('glossary_searcher started, term:', tokens);
    const glossaries = await searchGlossaries(tokens);
    return glossaries;
  },
});
