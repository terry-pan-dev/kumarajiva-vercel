import { z } from 'zod';

export const createSutraSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  category: z.string().min(1),
  translator: z.string().min(1),
  cbeta: z.string().min(1),
  language: z.enum(['chinese', 'english', 'sanskrit', 'indonesian']).default('chinese'),
  teamId: z.string().uuid().optional(),
  parentId: z.string().uuid().optional(),
});
