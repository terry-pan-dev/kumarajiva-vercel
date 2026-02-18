import type { Assistant } from 'openai/resources/beta/assistants.mjs';

import { OpenAI } from 'openai';

import { systemConfigTable } from '~/drizzle/tables';
import { getDb } from '~/lib/db.server';

const dbClient = getDb();

const assistantName = 'Chinese Tokenizer';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const tokenizerAgent = async (content: string) => {
  const tokenizerPrompt = await createUserPrompt(content);
  const tokenThread = await client.beta.threads.create();
  await client.beta.threads.messages.create(tokenThread.id, {
    role: 'user',
    content: tokenizerPrompt,
  });
  const assistant = await getOrCreateAssistant();
  const run = await client.beta.threads.runs.createAndPoll(tokenThread.id, {
    assistant_id: assistant?.id,
  });
  if (run.status === 'completed') {
    const messages = await client.beta.threads.messages.list(run.thread_id);
    for (const message of messages.data) {
      if (message.content[0].type === 'text') {
        try {
          const result = JSON.parse(message.content[0].text.value);
          return result.tokens;
        } catch (error) {
          console.error(error);
          return [];
        }
      }
    }
  }
};

const getOrCreateAssistant = async (): Promise<Assistant> => {
  const assistant = await getAssistant();
  if (!assistant) {
    return await createAssistant();
  }
  return assistant;
};

const createAssistant = async (): Promise<Assistant> => {
  return client.beta.assistants.create({
    name: assistantName,
    model: 'gpt-4o',
    temperature: 0,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'string_array',
        schema: {
          type: 'object',
          properties: {
            strings: {
              type: 'array',
              description: 'An array of string values.',
              items: {
                type: 'string',
              },
            },
          },
          required: ['strings'],
          additionalProperties: false,
        },
        strict: true,
      },
    },
    instructions: `
    You are tasked with tokenizing Chinese text. You are particularly good at
    tokenize traditional Chinese and especially ancient Chinese buddhist sutras.
    Tokenization is the process of breaking down a text into individual words or
    meaningful units. In Chinese, this task is particularly challenging because
    words are not separated by spaces.

    Follow these rules for tokenization:

    1. Automatically remove common stop words by default. If given <stop_words>
    is not empty, include given stop words as well
    2. Identify individual words and separate them with spaces.
    3. Remove numbers, punctuation marks, and special characters.
    4. If you encounter ambiguous cases where multiple valid tokenizations are
    possible, choose the one that seems most natural or common in standard
    Chinese usage.
    5. Remove repeated tokens from the output.

    Special cases to consider:
    - Measure words should typically be kept with their associated numbers
    (e.g., "三个" should be one token).
    - Common idioms or set phrases should generally be kept as single tokens.
    - For words with prefixes or suffixes, use your judgment to decide whether
    to separate them or keep them together based on common usage.

    After tokenizing the text, provide your output in the following format:

    <examples>
    <example>
    <text>
    我爱自然语言处理
    </text>
    <output>
    [我,爱,自然,语言,自然语言,处理]
    </output>
    </example>
    <example>
    <text>
    小明硕士毕业于中国科学院计算所，后在日本京都大学深造
    <stop_words>
    [后，在，日本]
    </stop_words>
    <output>
    [小明, 硕士, 毕业, 于, 中国, 科学, 学院, 科学院, 中国科学院, 计算, 计算所, 京都, 大学, 日本京都大学, 深造]
    </output>
    </example>
    </examples>

    Remember to carefully consider each character and its context when making
    tokenization decisions.

    Please proceed with the tokenization task now. 
    `,
  });
};

export const getAssistant = async (): Promise<Assistant | undefined> => {
  const { data } = await client.beta.assistants.list();
  const assistant = data.find((item) => item.name === assistantName);
  return assistant;
};

export const getStopWords = async (): Promise<string[]> => {
  const stopWords = await dbClient.select().from(systemConfigTable);
  const stopWordsArray = stopWords.map((item) => item.stopWords).flat();
  return stopWordsArray.filter((item): item is string => item !== null) || [];
};

const createUserPrompt = async (content: string) => {
  const stopWords = await getStopWords();
  const stopWordsString = stopWords.length
    ? `
  <stop_words>
  ${stopWords.join('\n')}
  </stop_words>
  `
    : '';

  const tokenizerPrompt =
    `
  <text>
  ${content}
  </text> 
  ` + stopWordsString;

  console.log(tokenizerPrompt);
  return tokenizerPrompt;
};
