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

export const createCommentActionSchema = z.object({
  paragraphId: z.string().uuid(),
  selectedText: z.string(),
  comment: z.string().min(1, { message: 'Comment is required' }),
  kind: z.literal('createComment'),
});

export const updateCommentActionSchema = z.object({
  commentId: z.string().uuid(),
  resolved: z.string().transform((val) => {
    return val === '1';
  }),
  message: z.string().optional(),
  kind: z.literal('updateComment'),
});
