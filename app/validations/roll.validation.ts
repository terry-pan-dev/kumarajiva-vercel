import { z } from 'zod';

export const createRollSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().min(1),
});
