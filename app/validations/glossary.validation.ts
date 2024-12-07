import { z } from 'zod';

import { langEnum } from '../../drizzle/schema';
import { chineseRegex } from '../lib/utils';

export const glossaryFormSchema = z.object({
  sutraName: z.string().min(1).regex(chineseRegex, {
    message: 'Sutra Name only accept chinese',
  }),
  glossary: z
    .string()
    .min(1, {
      message: 'Glossary must be at least 1 characters.',
    })
    .regex(chineseRegex, {
      message: 'Glossary only accept chinese',
    }),
  sutraText: z.string().optional(),
  volume: z.string().optional(),
  cbetaFrequency: z.string().optional(),
  author: z.string().optional(),
  discussion: z.string().optional(),
});

export const glossaryEditFormSchema = z.object({
  translations: z.array(
    z.object({
      glossary: z.string(),
      language: z.enum(langEnum.enumValues),
      sutraName: z.string(),
      volume: z.string(),
      originSutraText: z.string().nullish(),
      targetSutraText: z.string().nullish(),
    }),
  ),
});
