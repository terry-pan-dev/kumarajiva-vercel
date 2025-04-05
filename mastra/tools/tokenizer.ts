import { createTool } from '@mastra/core';
import { z } from 'zod';

import { tokenizer } from '../../app/services/tokenizer.service';

export const tokenizerTool = createTool({
  id: 'tokenizer',
  description: 'Tokenize the text',
  inputSchema: z.object({
    text: z.string().describe('The text to tokenize'),
  }),
  outputSchema: z.object({
    tokens: z.array(z.string()).describe('The tokenized text'),
  }),
  execute: async ({ context }) => {
    return {
      tokens: await tokenizer(context.text),
    };
  },
});
