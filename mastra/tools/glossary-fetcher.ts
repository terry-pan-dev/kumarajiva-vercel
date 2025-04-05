import { createTool } from '@mastra/core';
import { randomUUID } from 'crypto';
import { z } from 'zod';

import { langEnum } from '../../drizzle/schema';
import { glossaryCrawlerAgent } from '../agents';

const glossarySearcherSchema = z.array(
  z.object({
    glossary: z.string().describe('The glossary of the term in Chinese in each page'),
    phonetic: z
      .string()
      .describe(
        'The phonetic of the term in Chinese, generally under Pronunciations, and we only interested in the value in [py]',
      ),
    translations: z.array(
      z
        .object({
          glossary: z.string().describe('The english glossary of the term in the bullet list'),
          sutraName: z
            .string()
            .describe(
              'the sutra name of the glossary from, try to find the value by your understanding, if not, the term like source(s) might help identify it. If you struggle to get it, just use unknown',
            ),
          author: z
            .string()
            .describe(
              'The author of the glossary, generally this is the value inside the square bracket after each bullet point',
            ),
        })
        .describe('The value in the bullet list of each page'),
    ),
  }),
);

export const glossaryFetcherTool = createTool({
  id: 'glossary_fetcher',
  description: 'Fetch the glossary from the buddhist dict site for the given term',
  inputSchema: z.object({
    languages: z
      .array(z.enum(langEnum.enumValues))
      .describe('The languages that the user understands')
      .default(['chinese', 'english']),
    term: z.string().describe('The term to search for'),
  }),

  execute: async ({ context }) => {
    const lang = context.languages ? context.languages.join('\n') : 'chinese, english';
    const language = `
    <languages>
    ${lang}
    </languages>
    `;
    try {
      const response = await glossaryCrawlerAgent.generate(
        [
          {
            role: 'user',
            content: language,
          },
          {
            role: 'user',
            content: context.term,
          },
        ],
        {
          experimental_output: glossarySearcherSchema,
        },
      );
      console.log('glossary_fetcher success', response.response.messages);
      response.response.messages.forEach((message) => {
        console.log(message.content);
      });
      const glossaries = response.object.map((item) => {
        return {
          id: randomUUID(),
          glossary: item.glossary,
          phonetic: item.phonetic,
          subscribers: 0,
          author: 'BDD',
          cbetaFrequency: 'unknown',
          translations: item.translations?.map((translation) => {
            return {
              glossary: translation.glossary,
              language: 'english',
              sutraName: translation.sutraName,
              volume: 'unknown',
              updatedBy: 'BDD',
              updatedAt: new Date().toISOString(),
              originSutraText: 'unknown',
              targetSutraText: 'unknown',
              author: translation.author,
              partOfSpeech: 'unknown',
              phonetic: 'unknown',
            };
          }),
        };
      });
      console.log(glossaries);
      return glossaries;
    } catch (error) {
      console.error(error);
      return [];
    }
  },
});
