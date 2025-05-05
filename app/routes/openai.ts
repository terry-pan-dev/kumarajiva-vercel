import type { ActionFunctionArgs, LoaderFunctionArgs } from '@vercel/remix';

import { json, redirect } from '@vercel/remix';
import OpenAI from 'openai';

import { assertAuthUser } from '../auth.server';

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

  return json({});
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const user = await assertAuthUser(request);
  if (!user) {
    return redirect('/login');
  }

  const body = await request.json();
  const content = body.origin;
  const sourceLang = user.originLang;
  const targetLang = user.targetLang;
  const originId = body.originId;
  const rollId = body.rollId;
  console.log({ sourceLang, targetLang, content, originId, rollId });

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

  let prompt = `
You are tasked with translating an ancient ${sourceLang} Buddhist sutra text into ${targetLang}.
Your goal is to create a translation that is not only accurate but also elegant
and poetic in tone. Here are your instructions:

First, you will be provided with the ${sourceLang} text to be translated:

<text>
${newContent}
</text>

If a glossary is provided, it will be presented here:

<glossary>
${Object.entries(body?.glossaries)
  .map(([origin, translations]) => {
    return `${origin} : ${JSON.stringify(translations)}`;
  })
  .join('\n')}
</glossary>

Follow these guidelines for your translation:

1. Approach the translation with reverence for the original text, aiming to
capture both its meaning and spiritual essence.

2. Use a poetic tone to make the reading elegant and advanced. This may include:
   - Employing elevated vocabulary where appropriate
   - Using rhythmic patterns or cadences in your phrasing
   - Incorporating poetic devices such as alliteration, assonance, or metaphor
when it enhances the text without distorting its meaning

3. If a glossary is provided, strive to incorporate the given terms into your
translation. However, feel free to adjust the usage based on the context,
meaning, and grammatical correctness of the overall translation.

4. While aiming for poetic elegance, ensure that the core meaning and teachings
of the sutra are accurately conveyed.

5. If you encounter any terms or concepts that are particularly challenging to
translate, you may provide a brief explanation in parentheses after the term.

6. Maintain a respectful and reverent tone throughout the translation, befitting
the sacred nature of the text.

Present your translation with the markdown header ### Translation. If you have
any notes or explanations about specific translation choices, include them after
the translation and new line with the markdown header ### Thinking Notes.

Remember, your goal is to create a translation that is not only accurate but
also captures the profound spiritual essence of the original text in an elegant,
poetic ${targetLang} rendering.
  `;

  console.log({ prompt });

  const encoder = new TextEncoder();
  try {
    const chunks = await client.chat.completions.create(
      {
        model: 'gpt-4-0613',
        stream: true,
        temperature: 0.3,
        messages: [
          {
            role: 'system',
            content: prompt.trim(),
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
