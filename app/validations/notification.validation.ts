import { z } from 'zod';

import { notificationEnum } from '~/drizzle/tables/enums';

export const createBannerSchema = z.object({
  message: z.string().min(1),
  type: z.enum(notificationEnum.enumValues),
});
