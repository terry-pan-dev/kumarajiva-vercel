import { z } from 'zod';

export const createRollSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().min(1),
  sutraId: z.string().uuid(),
  parentId: z
    .string()
    .uuid()
    .optional()
    .or(z.literal('').transform(() => undefined)),
  teamId: z.string().uuid().optional(),
});
