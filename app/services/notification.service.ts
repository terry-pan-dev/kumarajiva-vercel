import { and, eq, isNull, sql } from 'drizzle-orm';

import type { ReadUser } from '~/drizzle/schema';

import { notifications, type CreateNotification, type ReadNotification } from '~/drizzle/tables/notification';
import { dbClient } from '~/lib/db.server';

export const readActiveNotifications = async (): Promise<ReadNotification[]> => {
  return dbClient.query.notifications.findMany({
    where: and(eq(notifications.active, true), isNull(notifications.deletedAt)),
  });
};

export const readAllNotifications = async (): Promise<ReadNotification[]> => {
  return dbClient.query.notifications.findMany({
    where: isNull(notifications.deletedAt),
  });
};

export const createNotification = async (notification: CreateNotification) => {
  return dbClient.insert(notifications).values(notification);
};

export const toggleBanner = async ({ user, bannerId }: { user: ReadUser; bannerId: string }) => {
  return dbClient
    .update(notifications)
    .set({ active: sql`NOT ${notifications.active}`, updatedBy: user.id })
    .where(eq(notifications.id, bannerId));
};

export const deleteBanner = async ({ user, bannerId }: { user: ReadUser; bannerId: string }) => {
  return dbClient
    .update(notifications)
    .set({ deletedAt: new Date(), updatedBy: user.id })
    .where(eq(notifications.id, bannerId));
};

export const dismissNotification = async ({ user, notificationId }: { user: ReadUser; notificationId: string }) => {
  const notification = await dbClient.query.notifications.findFirst({
    where: eq(notifications.id, notificationId),
  });
  if (!notification) {
    return;
  }
  return dbClient
    .update(notifications)
    .set({
      dismissedBy: notification.dismissedBy ? [...notification.dismissedBy, user.id] : [user.id],
      updatedBy: user.id,
    })
    .where(eq(notifications.id, notificationId));
};
