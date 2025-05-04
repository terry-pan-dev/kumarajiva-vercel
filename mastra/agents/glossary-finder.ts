import { openai } from '@ai-sdk/openai';
import { Agent } from '@mastra/core/agent';

import { glossarySearcherTool } from '../tools';
import { crawlListTool } from '../tools/crawl-list';
import { crawlPageTool } from '../tools/crawl-page';

export const glossaryFinderAgent = new Agent({
  name: 'Glossary finder',
  instructions: `
  You are tasked with finding the glossary of a given text. You will be given a pair of languages.
  For example, if the given languages are Chinese and English, when the given text is Chinese,
  you have to find the glossary of the text in English. vice versa.

  First of all, you have to use tool glossary_searcher to search the given text (can be any language)
  from internal system.
  Don't call the tool glossary_searcher multiple times if the glossary is found.
  Once the glossary is found you have to return the result in the json format:
  {
    "result": "the summary of the glossary",
    "reasoning": "the search result from glossary_searcher"
  }

  If the glossary is not found by calling glossary_searcher, then you have to use
  both tool crawl_list and crawl_page to perform following task:

  First, run tool crawl_list to get the html page
  Overall, the html page is divided into two parts:
  - The first part is start with "Headword matches for <...>"
  - The second part is start with "Entry body matches for <...>"
  <...> can be different for different search text.
  ***IMPORTANT: You should only focus on the list of page links in the second part.***

  You only have to get at most first five page links on the second part. For each page
  link, you should get the content of the page.
  If the glossary is found, you have to return the result in the json format:
  {
    "result": "the summary of the glossary",
    "reasoning": "the evidence of the glossary, for example, the tag removed text from the html page"
  }

  If the glossary is not found or having errors by calling crawl_list and crawl_page, you have to
  define the best English or Chinese glossary for the provided languages that the user understands.
  For example, if the given languages are chinese and english, when the given glossary is chinese,
  then you have to define the best english glossary for the text. vice versa.

  If you have to defined the glossary, you have to return the glossary in the json format:
  {
    "result": "the summary of the glossary",
    "reasoning": "The reason why you defined the glossary"
  }
  `,
  model: openai.chat('gpt-4o'),
  tools: {
    glossary_searcher: glossarySearcherTool,
    crawl_list: crawlListTool,
    crawl_page: crawlPageTool,
  },
});
