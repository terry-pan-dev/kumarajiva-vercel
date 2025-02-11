import { redirect, type LoaderFunctionArgs } from '@vercel/remix';
import OpenAI from 'openai';

import { type Lang } from '../../drizzle/tables/enums';
import { assertAuthUser } from '../auth.server';
import { searchGlossaries } from '../services/edge.only';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Notice, this is HTTP 2.0 server push. This feature is only available for
 * http 2.0 protocol. If you test it locally, it may not work.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = await assertAuthUser(request);
  if (!user) {
    return redirect('/login');
  }
  const url = new URL(request.url);

  const content = url.searchParams.get('origin');
  const sourceLang = (url.searchParams.get('sourceLang') || 'chinese') as Lang;
  const targetLang = (url.searchParams.get('targetLang') || 'english') as Lang;
  console.log({ sourceLang, targetLang, content });

  if (!content?.trim()) {
    return;
  }

  // TODO: find a way to handle search results for long content
  const trimmedContent = content.trim();
  const contentArray = Array.from(trimmedContent);
  const truncatedContent = contentArray.slice(0, 150).join('');
  const newContent = truncatedContent;
  const byteLength = Buffer.byteLength(newContent, 'utf8');
  console.log(`UTF-8 byte length: ${byteLength}`);

  const glossaries: string[] = [];
  const searchResults = await searchGlossaries(newContent, 50);
  if (searchResults.length) {
    searchResults.forEach((result) => {
      let origin = '';
      if (sourceLang === 'chinese') {
        origin = result.glossary;
      }
      const target = result.translations?.find((t) => t.language === targetLang);
      if (target) {
        glossaries.push(`'''${origin}''' : '''${target.glossary}'''`);
      }
    });
  }

  let prompt = `Now you are a professional translator. You translate from ${sourceLang} to ${targetLang}, Please make concise and accurate translation.`;

  if (glossaries.length) {
    prompt += `\n\nHere are some glossaries you can reference: ${glossaries.join('\n')}`;
  }

  console.log({ prompt });

  const encoder = new TextEncoder();
  try {
    const chunks = await client.chat.completions.create(
      {
        model: 'gpt-4-0613',
        stream: true,
        messages: [
          {
            role: 'system',
            content: prompt,
          },
          {
            role: 'user',
            content: content.trim(),
          },
        ],
      },
      {
        signal: request.signal,
      },
    );

    const stream = new ReadableStream({
      async start(controller) {
        console.debug('start stream');
        try {
          for await (const chunk of chunks) {
            const encoded = encoder.encode(chunk.choices[0].delta.content ?? '');
            controller.enqueue(encoded);
          }
        } catch (error) {
          console.error('error in stream', error);
          controller.error(error);
        } finally {
          console.debug('end stream, close controller and abort openai stream');
          controller.close();
          chunks.controller.abort();
        }
      },
      async cancel() {
        console.debug('cancel stream');
        chunks.controller.abort();
      },
    });

    const host = request.headers.get('host');

    if (host?.includes('localhost')) {
      console.info('localhost uses chunked encoding transfer');
      return new Response(stream, {
        headers: {
          'Transfer-Encoding': 'chunked',
          'Content-Type': 'text/plain',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

    console.info('remote uses http 2.0 server push');
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error(`error in openai loader: ${error}`);
    if (error instanceof Error && error.name === 'AbortError') {
      console.info('user aborted the request');
      return new Response(null, { status: 204 });
    }
    throw error;
  }
};
