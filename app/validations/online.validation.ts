import { z } from 'zod';

import { ROLE_VALUES } from '~/utils/constants';

export const onlineSchema = z.object({
  id: z.string().uuid(),
  rollId: z.string().uuid(),
  username: z.string().min(1),
  avatar: z.string().min(1).nullable(),
  role: z.enum(ROLE_VALUES),
  email: z.string().email(),
  time: z.string().datetime(),
});

export type OnlineUser = z.infer<typeof onlineSchema>;
