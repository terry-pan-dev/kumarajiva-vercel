import { z } from 'zod';

import { langEnum } from '../../drizzle/schema';
import { chineseRegex } from '../lib/utils';

export const glossaryFormSchema = z.object({
  glossaryChinese: z
    .string()
    .min(1, {
      message: 'Glossary must be at least 1 characters.',
    })
    .regex(chineseRegex, {
      message: 'Glossary only accept chinese',
    }),
  phoneticChinese: z.string(),
  sutraTextChinese: z.string().optional(),
  volumeChinese: z.string().optional(),
  cbetaFrequencyChinese: z.string().optional(),
  authorChinese: z.string().optional(),
  discussionChinese: z.string().optional(),
  glossary: z.string().min(1, {
    message: 'Glossary must be at least 1 characters.',
  }),
  sutraText: z.string().optional(),
  sutraName: z.string().optional().default('佛教常用詞'),
  volume: z.string().optional(),
  author: z.string().optional(),
  partOfSpeech: z.string().optional(),
  phonetic: z.string().optional(),
});

export const glossaryEditFormSchema = z.object({
  id: z.string(),
  glossary: z.string(),
  phonetic: z.string(),
  author: z.string().nullish(),
  cbetaFrequency: z.string().nullish(),
  discussion: z.string().nullish(),
  translations: z.array(
    z.object({
      glossary: z.string(),
      language: z.enum(langEnum.enumValues),
      sutraName: z.string(),
      volume: z.string(),
      originSutraText: z.string().nullish(),
      targetSutraText: z.string().nullish(),
      author: z.string().nullish(),
      updatedAt: z.string().default(new Date().toISOString()),
      partOfSpeech: z.string().nullish(),
      phonetic: z.string().nullish(),
    }),
  ),
});

export const glossaryInsertFormSchema = z.object({
  id: z.string(),
  glossary: z.string(),
  language: z.enum(langEnum.enumValues),
  sutraName: z.string().transform((val) => (val.length > 0 ? val : '佛教常用詞')),
  volume: z.string().transform((val) => (val.length > 0 ? val : '-')),
  originSutraText: z.string().nullish(),
  targetSutraText: z.string().nullish(),
  author: z.string().transform((val) => (val.length > 0 ? val : '翻譯團隊')),
  partOfSpeech: z.string().nullish(),
  phonetic: z.string().nullish(),
});
