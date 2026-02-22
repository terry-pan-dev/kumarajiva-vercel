import { eq, inArray } from 'drizzle-orm';
import 'dotenv/config';

import type {
  CreateComment,
  CreateParagraph,
  CreateReference,
  CreateRoll,
  CreateSutra,
  ReadComment,
  ReadRoll,
  ReadUser,
} from '~/drizzle/schema';

import { commentsTable, paragraphsTable, referencesTable, rollsTable, sutrasTable } from '~/drizzle/schema';
import { getDb } from '~/lib/db.server';

export const db = getDb();

// --------------------------------------------------
// PARAGRAPHS — CRUD
// --------------------------------------------------

export const DbParagraphs = {
  // ---- READ ----

  findById: async (id: string) => {
    return db.query.paragraphsTable.findFirst({
      where: (paragraphs, { eq }) => eq(paragraphs.id, id),
    });
  },

  findByIds: async (ids: string[], limit?: number) => {
    if (!ids.length) return [];

    return db.query.paragraphsTable.findMany({
      where: (paragraphs, { inArray }) => inArray(paragraphs.id, ids),
      limit: limit,
    });
  },

  findByIdWithChildren: async (id: string) => {
    return db.query.paragraphsTable.findFirst({
      where: (paragraphs, { eq }) => eq(paragraphs.id, id),
      with: {
        children: true,
      },
    });
  },

  findByIdsWithChildrenAndRelations: async (ids: string[], limit?: number) => {
    if (!ids.length) return [];

    return db.query.paragraphsTable.findMany({
      where: (paragraphs, { inArray }) => inArray(paragraphs.id, ids),
      limit: limit,
      with: {
        // Fetches related children
        children: {
          columns: {
            content: true,
            language: true,
          },
        },
        // Fetches the parent record
        parent: {
          columns: {
            content: true,
            language: true,
          },
        },
        // Fetches the roll and its nested sutra
        roll: {
          columns: {
            title: true,
          },
          with: {
            sutra: {
              columns: {
                title: true,
              },
            },
          },
        },
      },
    });
  },

  findByRollId: async (rollId: string) => {
    return db.query.paragraphsTable.findMany({
      where: eq(paragraphsTable.rollId, rollId),
      orderBy: (paragraphs, { asc }) => [asc(paragraphs.number), asc(paragraphs.order)],
    });
  },

  findByRollIdWithChildren: async (rollId: string, user: ReadUser) => {
    return db.query.paragraphsTable.findMany({
      where: (paragraphs, { eq, and }) => and(eq(paragraphs.rollId, rollId), eq(paragraphs.language, user.originLang)),
      with: {
        children: {
          with: {
            history: {
              orderBy: (history, { desc }) => [desc(history.updatedAt)],
            },
            comments: {
              where: (comments, { eq }) => eq(comments.resolved, false),
            },
          },
        },
        references: {
          orderBy: (references, { asc }) => [asc(references.order)],
        },
        comments: {
          where: (comments, { eq }) => eq(comments.resolved, false),
        },
      },
      orderBy: (paragraphs, { asc }) => [asc(paragraphs.number), asc(paragraphs.order)],
    });
  },

  // ---- CREATE ----

  create: async (paragraph: CreateParagraph) => {
    return db.insert(paragraphsTable).values(paragraph).returning({ id: paragraphsTable.id });
  },

  createMany: async (paragraphs: CreateParagraph[]) => {
    if (!paragraphs.length) return [];
    return db.insert(paragraphsTable).values(paragraphs).returning({ id: paragraphsTable.id });
  },

  // ---- UPDATE ----

  updateById: async (id: string, data: Partial<CreateParagraph>) => {
    return db.update(paragraphsTable).set(data).where(eq(paragraphsTable.id, id));
  },

  updateByIds: async (ids: string[], data: Partial<CreateParagraph>) => {
    if (!ids.length) return;
    return db.update(paragraphsTable).set(data).where(inArray(paragraphsTable.id, ids));
  },

  // ---- DELETE ----

  deleteById: async (id: string) => {
    return db.delete(paragraphsTable).where(eq(paragraphsTable.id, id));
  },

  deleteByIds: async (ids: string[]) => {
    if (!ids.length) return;
    return db.delete(paragraphsTable).where(inArray(paragraphsTable.id, ids));
  },
};

// --------------------------------------------------
// REFERENCES — CRUD
// --------------------------------------------------

export const DbReferences = {
  // ---- READ ----

  findById: async (id: string) => {
    return db.query.referencesTable.findFirst({
      where: eq(referencesTable.id, id),
    });
  },

  findByIds: async (ids: string[], limit?: number) => {
    if (!ids.length) return [];

    return db.query.referencesTable.findMany({
      where: (references, { inArray }) => inArray(references.id, ids),
      limit: limit,
    });
  },

  findByParagraphId: async (paragraphId: string) => {
    return db.query.referencesTable.findMany({
      where: eq(referencesTable.paragraphId, paragraphId),
      orderBy: (references, { asc }) => [asc(references.order)],
    });
  },

  // ---- CREATE ----

  create: async (reference: CreateReference) => {
    return db.insert(referencesTable).values(reference).returning({ id: referencesTable.id });
  },

  createMany: async (references: CreateReference[]) => {
    if (!references.length) return [];
    return db.insert(referencesTable).values(references).returning({ id: referencesTable.id });
  },

  // ---- UPDATE ----

  updateById: async (id: string, data: Partial<CreateReference>) => {
    return db.update(referencesTable).set(data).where(eq(referencesTable.id, id));
  },

  updateByIds: async (ids: string[], data: Partial<CreateReference>) => {
    if (!ids.length) return;
    return db.update(referencesTable).set(data).where(inArray(referencesTable.id, ids));
  },

  // ---- DELETE ----

  deleteById: async (id: string) => {
    return db.delete(referencesTable).where(eq(referencesTable.id, id));
  },

  deleteByIds: async (ids: string[]) => {
    if (!ids.length) return;
    return db.delete(referencesTable).where(inArray(referencesTable.id, ids));
  },
};

// --------------------------------------------------
// ROLLS — CRUD
// --------------------------------------------------

export const DbRolls = {
  // ---- READ ----

  findById: async (id: string) => {
    return db.query.rollsTable.findFirst({
      where: eq(rollsTable.id, id),
    });
  },

  findByIdWithSutra: async (id: string) => {
    return db.query.rollsTable.findFirst({
      where: eq(rollsTable.id, id),
      with: {
        sutra: true,
      },
    });
  },

  findByIds: async (ids: string[], limit?: number) => {
    if (!ids.length) return [];

    return db.query.rollsTable.findMany({
      where: (rolls, { inArray }) => inArray(rolls.id, ids),
      limit: limit,
    });
  },

  findAll: async (): Promise<ReadRoll[]> => {
    return db.query.rollsTable.findMany();
  },

  findBySutraId: async (sutraId: string) => {
    return db.query.rollsTable.findMany({
      where: eq(rollsTable.sutraId, sutraId),
    });
  },

  // ---- CREATE ----

  create: async (roll: CreateRoll) => {
    return db.insert(rollsTable).values(roll).returning({ id: rollsTable.id });
  },

  createMany: async (rolls: CreateRoll[]) => {
    if (!rolls.length) return [];
    return db.insert(rollsTable).values(rolls).returning({ id: rollsTable.id });
  },

  // ---- UPDATE ----

  updateById: async (id: string, data: Partial<CreateRoll>) => {
    return db.update(rollsTable).set(data).where(eq(rollsTable.id, id));
  },

  updateByIds: async (ids: string[], data: Partial<CreateRoll>) => {
    if (!ids.length) return;
    return db.update(rollsTable).set(data).where(inArray(rollsTable.id, ids));
  },

  // ---- DELETE ----

  deleteById: async (id: string) => {
    return db.delete(rollsTable).where(eq(rollsTable.id, id));
  },

  deleteByIds: async (ids: string[]) => {
    if (!ids.length) return;
    return db.delete(rollsTable).where(inArray(rollsTable.id, ids));
  },
};

// --------------------------------------------------
// SUTRAS — CRUD
// --------------------------------------------------

export const DbSutras = {
  // ---- READ ----

  findById: async (id: string) => {
    return db.query.sutrasTable.findFirst({
      where: eq(sutrasTable.id, id),
    });
  },

  findByIds: async (ids: string[], limit?: number) => {
    if (!ids.length) return [];

    return db.query.sutrasTable.findMany({
      where: (sutras, { inArray }) => inArray(sutras.id, ids),
      limit: limit,
    });
  },

  findByLanguage: async (language: string) => {
    return db.query.sutrasTable.findMany({
      where: eq(sutrasTable.language, language as any),
    });
  },

  findByLanguageWithRolls: async (language: string) => {
    return db.query.sutrasTable.findMany({
      where: eq(sutrasTable.language, language as any),
      with: {
        rolls: {
          with: {
            children: true,
          },
        },
        children: true,
      },
    });
  },

  // ---- CREATE ----

  create: async (sutra: CreateSutra) => {
    return db.insert(sutrasTable).values(sutra).returning({ id: sutrasTable.id });
  },

  createMany: async (sutras: CreateSutra[]) => {
    if (!sutras.length) return [];
    return db.insert(sutrasTable).values(sutras).returning({ id: sutrasTable.id });
  },

  // ---- UPDATE ----

  updateById: async (id: string, data: Partial<CreateSutra>) => {
    return db.update(sutrasTable).set(data).where(eq(sutrasTable.id, id));
  },

  updateByIds: async (ids: string[], data: Partial<CreateSutra>) => {
    if (!ids.length) return;
    return db.update(sutrasTable).set(data).where(inArray(sutrasTable.id, ids));
  },

  // ---- DELETE ----

  deleteById: async (id: string) => {
    return db.delete(sutrasTable).where(eq(sutrasTable.id, id));
  },

  deleteByIds: async (ids: string[]) => {
    if (!ids.length) return;
    return db.delete(sutrasTable).where(inArray(sutrasTable.id, ids));
  },
};

// --------------------------------------------------
// COMMENTS — CRUD
// --------------------------------------------------

export const DbComments = {
  // ---- READ ----

  findById: async (id: string) => {
    return db.query.commentsTable.findFirst({
      where: eq(commentsTable.id, id),
    });
  },

  findByIds: async (ids: string[], limit?: number) => {
    if (!ids.length) return [];

    return db.query.commentsTable.findMany({
      where: (comments, { inArray }) => inArray(comments.id, ids),
      limit: limit,
    });
  },

  findByParagraphId: async (paragraphId: string) => {
    return db.query.commentsTable.findMany({
      where: eq(commentsTable.paragraphId, paragraphId),
    });
  },

  findAllUnresolvedWithRollParagraph: async (): Promise<ReadComment[]> => {
    return db.query.commentsTable.findMany({
      where: (comments, { eq }) => eq(comments.resolved, false),
      with: {
        roll: true,
        paragraph: true,
      },
    });
  },

  // ---- CREATE ----

  create: async (comment: CreateComment) => {
    return db.insert(commentsTable).values(comment);
  },

  createMany: async (comments: CreateComment[]) => {
    if (!comments.length) return [];
    return db.insert(commentsTable).values(comments);
  },

  // ---- UPDATE ----

  updateById: async (id: string, data: Partial<CreateComment>) => {
    return db.update(commentsTable).set(data).where(eq(commentsTable.id, id));
  },

  updateByIds: async (ids: string[], data: Partial<CreateComment>) => {
    if (!ids.length) return;
    return db.update(commentsTable).set(data).where(inArray(commentsTable.id, ids));
  },

  // ---- DELETE ----

  deleteById: async (id: string) => {
    return db.delete(commentsTable).where(eq(commentsTable.id, id));
  },

  deleteByIds: async (ids: string[]) => {
    if (!ids.length) return;
    return db.delete(commentsTable).where(inArray(commentsTable.id, ids));
  },
};
