import { z } from 'zod';

export const createSutraSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  category: z.string().min(1),
  translator: z.string().min(1),
});
