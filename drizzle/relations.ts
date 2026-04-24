import { relations } from 'drizzle-orm';

import { commentsTable } from './tables/comment';
import { contributorsTable } from './tables/contributor';
import { documentsTable } from './tables/document';
import { paragraphsTable, paragraphsHistoryTable } from './tables/paragraph';
import { projectsTable } from './tables/project';
import { referencesTable } from './tables/reference';
import { rollsTable } from './tables/roll';
import { sectionsTable } from './tables/section';
import { sutrasTable } from './tables/sutra';
import { teamsTable } from './tables/team';
import { usersTable } from './tables/user';
import { worksTable } from './tables/work';

export const paragraphsHistoryTableRelations = relations(paragraphsHistoryTable, ({ one }) => ({
  paragraph: one(paragraphsTable, {
    fields: [paragraphsHistoryTable.paragraphId],
    references: [paragraphsTable.id],
  }),
}));

export const paragraphsTableRelations = relations(paragraphsTable, ({ many, one }) => ({
  children: one(paragraphsTable, {
    references: [paragraphsTable.parentId],
    fields: [paragraphsTable.id],
  }),
  parent: one(paragraphsTable, {
    fields: [paragraphsTable.parentId],
    references: [paragraphsTable.id],
  }),
  roll: one(rollsTable, {
    fields: [paragraphsTable.rollId],
    references: [rollsTable.id],
  }),
  section: one(sectionsTable, {
    fields: [paragraphsTable.sectionId],
    references: [sectionsTable.id],
  }),
  document: one(documentsTable, {
    fields: [paragraphsTable.documentId],
    references: [documentsTable.id],
  }),
  history: many(paragraphsHistoryTable),
  references: many(referencesTable),
  comments: many(commentsTable),
}));

export const referencesTableRelations = relations(referencesTable, ({ one }) => ({
  paragraph: one(paragraphsTable, {
    fields: [referencesTable.paragraphId],
    references: [paragraphsTable.id],
  }),
}));

export const rollsTableRelations = relations(rollsTable, ({ one, many }) => ({
  sutra: one(sutrasTable, {
    fields: [rollsTable.sutraId],
    references: [sutrasTable.id],
  }),
  children: one(rollsTable, {
    fields: [rollsTable.id],
    references: [rollsTable.parentId],
  }),
  parent: one(rollsTable, {
    fields: [rollsTable.parentId],
    references: [rollsTable.id],
  }),
  paragraphs: many(paragraphsTable),
}));

export const sutrasTableRelations = relations(sutrasTable, ({ one, many }) => ({
  team: one(teamsTable, {
    fields: [sutrasTable.teamId],
    references: [teamsTable.id],
  }),
  children: one(sutrasTable, {
    fields: [sutrasTable.id],
    references: [sutrasTable.parentId],
  }),
  parent: one(sutrasTable, {
    fields: [sutrasTable.parentId],
    references: [sutrasTable.id],
  }),
  rolls: many(rollsTable),
}));

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

export const teamsTableRelations = relations(teamsTable, ({ many }) => ({
  sutras: many(sutrasTable),
  projects: many(projectsTable),
  users: many(usersTable),
}));

export const worksTableRelations = relations(worksTable, ({ many }) => ({
  documents: many(documentsTable),
}));

export const documentsTableRelations = relations(documentsTable, ({ one, many }) => ({
  work: one(worksTable, {
    fields: [documentsTable.workId],
    references: [worksTable.id],
  }),
  contributors: many(contributorsTable),
  sections: many(sectionsTable),
}));

export const contributorsTableRelations = relations(contributorsTable, ({ one }) => ({
  document: one(documentsTable, {
    fields: [contributorsTable.documentId],
    references: [documentsTable.id],
  }),
}));

export const sectionsTableRelations = relations(sectionsTable, ({ one, many }) => ({
  document: one(documentsTable, {
    fields: [sectionsTable.documentId],
    references: [documentsTable.id],
  }),
  parent: one(sectionsTable, {
    fields: [sectionsTable.parentId],
    references: [sectionsTable.id],
  }),
  children: many(sectionsTable),
}));

export const projectsTableRelations = relations(projectsTable, ({ one }) => ({
  team: one(teamsTable, {
    fields: [projectsTable.teamId],
    references: [teamsTable.id],
  }),
  sourceDocument: one(documentsTable, {
    fields: [projectsTable.sourceDocumentId],
    references: [documentsTable.id],
  }),
  targetDocument: one(documentsTable, {
    fields: [projectsTable.targetDocumentId],
    references: [documentsTable.id],
  }),
}));

export const usersTableRelations = relations(usersTable, ({ one }) => ({
  team: one(teamsTable, {
    fields: [usersTable.teamId],
    references: [teamsTable.id],
  }),
}));
