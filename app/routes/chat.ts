import { redirect, type LoaderFunctionArgs } from '@vercel/remix';
import OpenAI from 'openai';
import { assertAuthUser } from '../auth.server';

export const config = { runtime: 'edge' };

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

  if (!content) {
    return;
  }

  const encoder = new TextEncoder();
  const chunks = await client.chat.completions.create({
    model: 'gpt-4o',
    stream: true,
    messages: [
      {
        role: 'system',
        content: `Now you are professional translator. You translate from ${user.originLang} to ${user.targetLang}.`,
      },
      {
        role: 'user',
        content: content,
      },
    ],
  });

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
};
