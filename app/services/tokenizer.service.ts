import { Anthropic } from '@anthropic-ai/sdk';

import { getStopWords } from './openai.service';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const tokenizer = async (content: string): Promise<string[]> => {
  const stopWords = await getStopWords();

  let prompt = `
    <text>
    ${content}
    </text>
  `;

  if (stopWords.length > 0) {
    prompt += `
    <stop_words>
    ${stopWords.join('\n')}
    </stop_words>
    `;
  }

  try {
    const msg = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 8192,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: '<examples>\n<example>\n<CHINESE_TEXT>\n復有佛世界微塵數主城神，所謂：寶峯光耀主城神\n</CHINESE_TEXT>\n<ideal_output>\n[復有,佛,世界,佛世界,微塵, 微塵數, 主城神, 所謂, 寶峯光耀主城神]\n</ideal_output>\n</example>\n<example>\n<CHINESE_TEXT>\n爾時，如來道場眾海，悉已雲集\n</CHINESE_TEXT>\n<ideal_output>\n[爾時, 如來, 如來道場,眾海, 悉已雲集]\n</ideal_output>\n</example>\n</examples>\n\n',
            },
            {
              type: 'text',
              text: `
            You are tasked with tokenizing Chinese text. You are particularly
            good at tokenizing traditional chinese text, especially ancient
            chinese sutra text. Tokenization is the process of breaking down a
            text into individual words or meaningful units. In Chinese, this
            task is particularly challenging because words are not separated by
            spaces.

            Here is the Chinese text you need to tokenize:

            ${prompt}

            Follow these rules for tokenization:

            1. Automatically remove stop words by default. If given
            <stop_words> is not empty, include given stop words as well
            2. Identify individual words and separate them with spaces.
            3. Remove numbers, punctuation marks, and special characters.
            4. If you encounter ambiguous cases where multiple valid
            tokenizations are possible, choose the one that seems most natural
            or common in standard Chinese usage.
            5. Remove repeated tokens from the output.

            Special cases to consider:
            - Measure words should typically be kept with their associated
            numbers (e.g., "佛弟子" should be one token).
            - Common idioms or set phrases should generally be kept as single tokens.
            - For words with prefixes or suffixes, use your judgment to decide
            whether to separate them or keep them together based on common usage.

            Remember to carefully consider each character and its context when
            making tokenization decisions.

            When output only output me the final result in JSON format with key tokens, and value of list of string.

            Please proceed with the tokenization task now. 
            `,
            },
          ],
        },
      ],
    });
    if (msg.content[0].type === 'text') {
      const rawTokens = msg.content[0].text;
      const tokens = JSON.parse(rawTokens);
      return tokens?.tokens || [];
    } else {
      console.error('No tokens found');
      return [];
    }
  } catch (error) {
    console.error(error);
    return [];
  }
};
