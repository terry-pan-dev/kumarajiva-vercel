import { z } from 'zod';

export const paragraphActionSchema = z.object({
  paragraphId: z
    .string({
      required_error: 'Please contact support, this error should not happen',
    })
    .uuid(),
  translation: z.string().min(1, { message: 'Translation is required' }),
  kind: z.enum(['update', 'insert']),
});
