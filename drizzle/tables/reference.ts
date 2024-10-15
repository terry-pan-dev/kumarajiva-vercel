import { auditAtFields, auditByFields } from "../audit";
import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { paragraphsTable } from "./paragraph";
import { relations } from "drizzle-orm";

export const referencesTable = pgTable("references", {
  id: uuid("id").primaryKey().defaultRandom(),
  sutraName: text("sutra_name").notNull(),
  content: text("content").notNull(),
  paragraphId: uuid("paragraph_id")
    .references(() => paragraphsTable.id)
    .notNull(),
  ...auditAtFields,
  ...auditByFields,
});

export const referencesTableRelations = relations(
  referencesTable,
  ({ one }) => ({
    paragraph: one(paragraphsTable, {
      fields: [referencesTable.paragraphId],
      references: [paragraphsTable.id],
    }),
  })
);
