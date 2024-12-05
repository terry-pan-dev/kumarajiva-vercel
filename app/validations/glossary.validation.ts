import { z } from 'zod';

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
