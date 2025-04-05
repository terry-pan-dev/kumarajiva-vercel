import { openai } from '@ai-sdk/openai';
import { Agent } from '@mastra/core/agent';

import { crawlListTool } from '../tools/crawl-list';
import { crawlPageTool } from '../tools/crawl-page';

export const glossaryCrawlerAgent = new Agent({
  name: 'Glossary Crawler',
  instructions: `
  You are tasked with crawling a website with the given search text.

  First of all, run tool crawl_list to get the list of the maximum first five
  page links in the website.
  **IMPORTANT**: only get the maximum first five page links (only the endpoints,
  not the full url) from the returned text.

  Then, for each page link, run tool crawl_page to get the content of the page.
  Finally you have to return a list of objects. If nothing got from the crawl_page,
  you have to return an empty list.
  `,
  model: openai.chat('gpt-4o-mini'),
  tools: {
    crawl_list: crawlListTool,
    crawl_page: crawlPageTool,
  },
});
