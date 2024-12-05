import { boolean, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { auditAtFields, auditByFields } from '../audit';
import { notificationEnum } from './enums';

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  message: text('message').notNull(),
  type: notificationEnum('type').notNull(),
  active: boolean('active').notNull().default(true),
  dismissedBy: jsonb('dismissedBy').$type<string[]>().default([]),
  ...auditAtFields,
  ...auditByFields,
});
export type ReadNotification = typeof notifications.$inferSelect;
export type BannerType = Omit<
  ReadNotification,
  'dismissedBy' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'createdBy' | 'updatedBy'
>;
export type CreateNotification = typeof notifications.$inferInsert;
