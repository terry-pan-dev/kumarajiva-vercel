import type { ActionFunctionArgs, LoaderFunctionArgs } from '@vercel/remix';

import { json, redirect } from '@vercel/remix';
import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { z } from 'zod';

import { assertAuthUser } from '~/auth.server';
import { searchGlossaries } from '~/services/glossary.service';

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
  const trimmedContent = content.trim();
  console.log({ sourceLang, targetLang, content, originId, rollId });

  if (!trimmedContent) {
    return;
  }

  const TokenizerSchema = z.object({
    tokens: z.array(z.string()),
  });
  const tokenizer = await client.beta.chat.completions.parse({
    model: 'gpt-4o-2024-08-06',
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content: `
    You are tasked with tokenizing Chinese text. You are particularly
    good at tokenizing traditional chinese text, especially ancient
    chinese sutra text. Tokenization is the process of breaking down a
    text into individual words or meaningful units. In Chinese, this
    task is particularly challenging because words are not separated by
    spaces.

    Follow these rules for tokenization:

    1. Automatically remove stop words by default. If given
    <stop_words> is not empty, include given stop words as well
    2. Identify individual words and separate them with spaces.
    3. Remove numbers, punctuation marks, and special characters.
    4. If you encounter ambiguous cases where multiple valid
    tokenizations are possible, choose the one that seems most natural
    or common in standard Chinese usage.
    5. If tokens are same, remove same tokens from the output.

    Special cases to consider:
    - Measure words should typically be kept with their associated
    numbers (e.g., "佛弟子" should be one token).
    - Common idioms or set phrases should generally be kept as single tokens.
    - For words with prefixes or suffixes, use your judgment to decide
    whether to separate them or keep them together based on common usage.

    Remember to carefully consider each character and its context when
    making tokenization decisions.

    When output only output me the final result in JSON format with key tokens,
    and value of list of string.

    Please proceed with the tokenization task now. 
      `,
      },
      { role: 'user', content: content },
    ],
    response_format: zodResponseFormat(TokenizerSchema, 'tokens'),
  });

  let tokens = [];
  let glossaries = {};
  if (tokenizer.choices[0].message.parsed) {
    const parsed = tokenizer.choices[0].message.parsed;
    if (Array.isArray(parsed.tokens)) {
      tokens = parsed.tokens;
      glossaries = await searchGlossaries(tokens);
      console.log('glossaries', glossaries);
    }
  }

  // TODO: find a way to handle search results for long content
  const contentArray = Array.from(trimmedContent);
  const truncatedContent = contentArray.slice(0, 150).join('');
  const newContent = truncatedContent;

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
${JSON.stringify(glossaries)}
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
any notes or explanations about specific translation choices, For example
- why you choose this glossary among a list of glossaries
- include the pair of glossary you chosen
- Grammarly concerns
- cohesion of meaning
- overall translation rationale

include them after the translation and new line with the markdown header ### Thinking Notes.

Remember, your goal is to create a translation that is not only accurate but
also captures the profound spiritual essence of the original text in an elegant,
poetic ${targetLang} rendering.
  `;

  const encoder = new TextEncoder();
  try {
    const chunks = await client.chat.completions.create(
      {
        model: 'gpt-4o',
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
