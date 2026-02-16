import { z } from 'zod';

import { NOTIFICATION_VALUES } from '~/utils/constants';

export const createBannerSchema = z.object({
  message: z.string().min(1),
  type: z.enum(NOTIFICATION_VALUES),
});
