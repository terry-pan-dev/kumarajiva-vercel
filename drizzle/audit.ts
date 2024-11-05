import { text, timestamp } from 'drizzle-orm/pg-core';

export const auditAtFields = {
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp('deleted_at'),
};

export const auditByFields = {
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by').notNull(),
};
