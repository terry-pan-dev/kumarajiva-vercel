import { langEnum, roleEnum } from '~/drizzle/schema';
import { z } from 'zod';

export const createUserSchema = z.object({
  username: z.string().min(1),
  email: z.string().email(),
  teamId: z.string().uuid(),
  originLang: z.enum(langEnum.enumValues),
  targetLang: z.enum(langEnum.enumValues),
  role: z.enum(roleEnum.enumValues),
  password: z.string().min(1),
});

export const updateUserSchema = createUserSchema.extend({ id: z.string().uuid() }).omit({ password: true }).partial();

export type UpdateUserSchema = z.infer<typeof updateUserSchema>;
