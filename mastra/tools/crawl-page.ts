import { createTool } from '@mastra/core';
import { z } from 'zod';

export const crawlPageTool = createTool({
  id: 'crawl_page',
  description: 'Crawl the page of the website',
  inputSchema: z.object({
    endpoint: z.string().describe('The endpoint of the website to crawl'),
  }),
  execute: async ({ context }) => {
    const url = new URL(context.endpoint, 'http://www.buddhism-dict.net');
    console.log('crawl_page started', url.toString());
    const result = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Basic ${btoa('guest:')}`,
      },
    });
    if (result.status === 200) {
      console.log('crawl_page success');
      const text = await result.text();
      return text;
    }
    return 'No result found';
  },
});
