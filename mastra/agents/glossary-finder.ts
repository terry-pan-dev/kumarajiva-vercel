import { openai } from '@ai-sdk/openai';
import { Agent } from '@mastra/core/agent';

import { glossaryFetcherTool, glossarySearcherTool } from '../tools';

export const glossaryFinderAgent = new Agent({
  name: 'Glossary finder',
  instructions: `
  You are tasked with finding the glossary of a given text.

  First of all, you have to use tool glossary_searcher to search for the glossary from database.
  if the glossary is found, you have to return the summary of the glossary. Don't call the tool glossary_searcher
  multiple times if the glossary is found.

  If the glossary is not found, you have to use tool glossary_fetcher to fetch the glossary from buddhist dict site.
  Then, if the glossary is found, you have to return the summary of the glossary.

  If the glossary is not found, you will be provided with languages that the user understands.
  For example, if the given languages are chinese and english, when the given glossary is chinese,
  then you have to define the best english glossary for the text. vice versa.
  `,
  model: openai.chat('gpt-4o'),
  tools: {
    glossary_searcher: glossarySearcherTool,
    glossary_fetcher: glossaryFetcherTool,
  },
});
