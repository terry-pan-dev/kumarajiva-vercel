import { z } from 'zod';

import { LANG_VALUES, ROLE_VALUES } from '~/utils/constants';

export const createUserSchema = z.object({
  username: z.string().min(1),
  email: z.string().email(),
  teamId: z.string().uuid(),
  originLang: z.enum(LANG_VALUES),
  targetLang: z.enum(LANG_VALUES),
  role: z.enum(ROLE_VALUES),
  password: z.string().min(1),
});

export const updateUserSchema = createUserSchema.extend({ id: z.string().uuid() }).omit({ password: true }).partial();

export const resetPasswordSchema = z.object({
  userId: z.string().uuid(),
  password: z.string().min(1),
});

export type UpdateUserSchema = z.infer<typeof updateUserSchema>;
export type ResetPasswordSchema = z.infer<typeof resetPasswordSchema>;
