import { pgEnum } from 'drizzle-orm/pg-core';

import { LANG_VALUES, ROLE_VALUES, NOTIFICATION_VALUES } from '~/utils/constants';

// Drizzle definitions for the Postgres types
export const langEnum = pgEnum('lang', LANG_VALUES);
export const roleEnum = pgEnum('roles', ROLE_VALUES);
export const notificationEnum = pgEnum('notification_type', NOTIFICATION_VALUES);
