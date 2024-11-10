import { notificationEnum } from '~/drizzle/tables/enums';
import { z } from 'zod';

export const createBannerSchema = z.object({
  message: z.string().min(1),
  type: z.enum(notificationEnum.enumValues),
});
