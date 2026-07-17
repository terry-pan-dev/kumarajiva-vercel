import { z } from 'zod';

export const createDocumentSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  translator: z.string().min(1),
});
