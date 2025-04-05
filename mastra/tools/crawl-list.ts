import { createTool } from '@mastra/core';
import { z } from 'zod';

export const crawlListTool = createTool({
  id: 'crawl_list',
  description: 'Crawl the list of all the pages in the website',
  inputSchema: z.object({
    text: z.string().describe('The text to search for'),
  }),
  execute: async ({ context }) => {
    console.log('crawl_list started with term: ', context.text);
    const url = new URL(`/cgi-bin/search-ddb4.pl?Terms=${context.text}`, 'http://www.buddhism-dict.net');
    const result = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Basic ${btoa('guest:')}`,
      },
    });
    if (result.status === 200) {
      console.log('crawl_list success');
      const text = await result.text();
      return text;
    }
    return 'No result found';
  },
});
