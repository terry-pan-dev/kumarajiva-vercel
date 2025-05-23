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
  sutraName: z
    .string()
    .refine(
      (val) => {
        if (val.length > 0) {
          return chineseRegex.test(val);
        } else {
          return true;
        }
      },
      {
        message: 'Sutra Name only accept chinese',
      },
    )
    .optional()
    .default('佛教常用詞'),
  volume: z.string().optional(),
  cbetaFrequency: z.string().optional(),
  author: z.string().optional(),
  discussion: z.string().optional(),
  partOfSpeech: z.string().optional(),
  phonetic: z.string().optional(),
});

export const glossaryEditFormSchema = z.object({
  id: z.string(),
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
