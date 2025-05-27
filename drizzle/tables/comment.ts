import { relations } from 'drizzle-orm';
import { index, jsonb, pgTable, text, uuid, boolean } from 'drizzle-orm/pg-core';

import { auditByFields, auditAtFields } from '../audit';
import { paragraphsTable } from './paragraph';
import { rollsTable } from './roll';

export const commentsTable = pgTable(
  'comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    rollId: uuid('roll_id')
      .references(() => rollsTable.id)
      .notNull(),
    paragraphId: uuid('paragraph_id')
      .references(() => paragraphsTable.id)
      .notNull(),
    messages: jsonb('messages')
      .$type<
        {
          text: string;
          userId: string;
          createdAt: string;
        }[]
      >()
      .default([]),
    // selected text is only stored for the first level of comments
    selectedText: text('selected_text'),
    resolved: boolean('resolved').default(false),
    ...auditAtFields,
    ...auditByFields,
  },
  (t) => [index('rollId_and_paragraphId_index').on(t.rollId, t.paragraphId)],
);

export const commentsTableRelations = relations(commentsTable, ({ one, many }) => ({
  paragraph: one(paragraphsTable, {
    fields: [commentsTable.paragraphId],
    references: [paragraphsTable.id],
  }),
  roll: one(rollsTable, {
    fields: [commentsTable.rollId],
    references: [rollsTable.id],
  }),
}));

export type CreateComment = typeof commentsTable.$inferInsert;
export type ReadComment = typeof commentsTable.$inferSelect;
export type UpdateComment = Partial<CreateComment>;
