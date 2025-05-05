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
            content: '「諸佛子！彼金剛寶聚香水海外，次有香水海，名：崇飾寶埤堄；世界種，名：秀出寶幢。',
          },
          {
            role: 'assistant',
            content:
              'Disciples of the Buddha! Beyond the fragrant sea, Gathering of Vajra Jewels, lies the next fragrant sea named Exalted Adornment of Jewel Parapets. The world seed within is called Exquisite Jewel Banners.',
          },
          {
            role: 'user',
            content: '於此世界種最上方，有世界，名：華幢海；佛號：無盡變化妙慧雲。',
          },
          {
            role: 'assistant',
            content:
              'On the highest level of this world seed is a world system named Sea of Flower Banners. The Buddha there is named Cloud of Endless Transformations and Wondrous Wisdom. 	',
          },
          {
            role: 'user',
            content: '此上與娑婆世界齊等，有世界，名：瑠璃輪普莊嚴；佛號：須彌燈。',
          },
          {
            role: 'assistant',
            content:
              'Above this, on the same level as the Saha world system, lies a world system named Vaiḍūrya Wheel of Universal Splendor. The Buddha there is named Sumeru Lamp. ',
          },
          {
            role: 'user',
            content: '此上過十佛剎微塵數世界，與金剛幢世界齊等，有世界，名：莊嚴相；佛號：超勝大光明。',
          },
          {
            role: 'assistant',
            content:
              'Above this and passing through world systems as many as particles of dust in ten Buddha lands, on the same level as, the world system named Vajra Banner, lies a world system named Sublime Appearance. The Buddha there is called Transcending Great Radiance.	 	 	 	',
          },
          {
            role: 'user',
            content: '此中最下方，有世界，名：妙勝藏；佛號：最勝功德慧。',
          },
          {
            role: 'assistant',
            content:
              'At its very bottom lies a world system named Wondrously Supreme Treasury. The Buddha there is named Wisdom of Supreme Merit and Virtue.',
          },
          {
            role: 'user',
            content:
              '如是等不可說佛剎微塵數香水海，其最近輪圍山香水海，名：出帝青寶；世界種，名：周遍無差別，以一切菩薩震吼聲為體。',
          },
          {
            role: 'assistant',
            content:
              'Fragrant seas such as these are as numerous as dust particles in an ineffable number of Buddha lands. The fragrant sea closest to the Ring of Mountains is named Emergence of Indranila Gems; the world seed within is called Everywhere Free of Differences, and it is composed of Bodhisattvas’ thunderous roars.',
          },
          {
            role: 'user',
            content: '次有香水海，名：可愛摩尼珠充滿遍照；世界種，名：普吼聲……。',
          },
          {
            role: 'assistant',
            content:
              'Next is a fragrant sea named Brimming with Delightful Mani Pearls Shining Everywhere. The world seed within is called All-Pervading Roar.',
          },
          {
            role: 'user',
            content: '次有香水海，名：大光遍照；世界種，名：帝青炬光明。',
          },
          {
            role: 'assistant',
            content:
              'Next is a fragrant sea named Blazing Light Shining Everywhere. The world seed within is called Indranila Torchlight. ',
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
