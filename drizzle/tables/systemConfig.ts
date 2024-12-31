import { pgTable, jsonb } from 'drizzle-orm/pg-core';

export const systemConfigTable = pgTable('system_config', {
  stopWords: jsonb('stop_words').$type<string[]>().default([]),
});

export type SystemConfig = typeof systemConfigTable.$inferSelect;
export type CreateSystemConfig = typeof systemConfigTable.$inferInsert;
