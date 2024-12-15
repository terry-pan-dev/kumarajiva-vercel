import { z } from 'zod';

import { roleEnum } from '~/drizzle/tables/enums';

export const onlineSchema = z.object({
  id: z.string().uuid(),
  rollId: z.string().uuid(),
  username: z.string().min(1),
  avatar: z.string().min(1).nullable(),
  role: z.enum(roleEnum.enumValues),
  email: z.string().email(),
  time: z.string().datetime(),
});

export type OnlineUser = z.infer<typeof onlineSchema>;
