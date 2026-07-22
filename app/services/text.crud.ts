import { and, eq, inArray } from 'drizzle-orm';

import type {
  CreateContributor,
  CreateDocument,
  CreateParagraphNew,
  CreateSection,
  CreateWork,
} from '~/drizzle/schema';

import { contributorsTable, documentsTable, paragraphsTableNew, sectionsTable, worksTable } from '~/drizzle/schema';
import { getDb } from '~/lib/db.server';

const db = getDb();

export const DbWorks = {
  findById: async (id: string) => {
    return db.query.worksTable.findFirst({
      where: eq(worksTable.id, id),
      with: { documents: { with: { contributors: true } } },
    });
  },

  findAll: async () => {
    return db.query.worksTable.findMany({
      with: { documents: { with: { contributors: true } } },
    });
  },

  create: async (work: CreateWork) => {
    return db.insert(worksTable).values(work).returning({ id: worksTable.id });
  },

  updateById: async (id: string, data: Partial<CreateWork>) => {
    return db.update(worksTable).set(data).where(eq(worksTable.id, id));
  },
};

export const DbDocuments = {
  findAll: async () => {
    return db.query.documentsTable.findMany({
      with: {
        contributors: true,
        sections: {
          with: { children: true },
          orderBy: (sections, { asc }) => [asc(sections.order)],
        },
      },
    });
  },

  findById: async (id: string) => {
    return db.query.documentsTable.findFirst({
      where: eq(documentsTable.id, id),
      with: {
        work: true,
        contributors: true,
        sections: {
          with: { children: true },
          orderBy: (sections, { asc }) => [asc(sections.order)],
        },
      },
    });
  },

  findByWorkId: async (workId: string) => {
    return db.query.documentsTable.findMany({
      where: eq(documentsTable.workId, workId),
      with: {
        contributors: true,
        sections: {
          orderBy: (sections, { asc }) => [asc(sections.order)],
        },
      },
    });
  },

  // A document's work is its single source of truth; sections and projects
  // denormalise work_id, so they derive it from the document rather than
  // asking callers to pass it. This is the lightweight lookup for that.
  findWorkId: async (id: string): Promise<string | null> => {
    const document = await db.query.documentsTable.findFirst({
      where: eq(documentsTable.id, id),
      columns: { workId: true },
    });
    return document?.workId ?? null;
  },

  create: async (document: CreateDocument) => {
    return db.insert(documentsTable).values(document).returning({ id: documentsTable.id });
  },

  updateById: async (id: string, data: Partial<CreateDocument>) => {
    return db.update(documentsTable).set(data).where(eq(documentsTable.id, id));
  },

  deleteById: async (id: string) => {
    return db.delete(documentsTable).where(eq(documentsTable.id, id));
  },
};

export const DbContributors = {
  findByDocumentId: async (documentId: string) => {
    return db.query.contributorsTable.findMany({
      where: eq(contributorsTable.documentId, documentId),
    });
  },

  create: async (contributor: CreateContributor) => {
    return db.insert(contributorsTable).values(contributor).returning({ id: contributorsTable.id });
  },

  createMany: async (contributors: CreateContributor[]) => {
    if (!contributors.length) return [];
    return db.insert(contributorsTable).values(contributors).returning({ id: contributorsTable.id });
  },

  deleteByDocumentId: async (documentId: string) => {
    return db.delete(contributorsTable).where(eq(contributorsTable.documentId, documentId));
  },
};

export const DbSections = {
  findById: async (id: string) => {
    return db.query.sectionsTable.findFirst({
      where: eq(sectionsTable.id, id),
      with: {
        document: true,
        children: true,
      },
    });
  },

  findByIds: async (ids: string[]) => {
    if (!ids.length) return [];
    return db.query.sectionsTable.findMany({
      where: inArray(sectionsTable.id, ids),
      with: { children: true },
    });
  },

  findByDocumentId: async (documentId: string) => {
    return db.query.sectionsTable.findMany({
      where: eq(sectionsTable.documentId, documentId),
      with: { children: true },
      orderBy: (sections, { asc }) => [asc(sections.order)],
    });
  },

  create: async (section: CreateSection) => {
    return db.insert(sectionsTable).values(section).returning({ id: sectionsTable.id });
  },

  createMany: async (sections: CreateSection[]) => {
    if (!sections.length) return [];
    return db.insert(sectionsTable).values(sections).returning({ id: sectionsTable.id });
  },

  updateById: async (id: string, data: Partial<CreateSection>) => {
    return db.update(sectionsTable).set(data).where(eq(sectionsTable.id, id));
  },

  deleteById: async (id: string) => {
    return db.delete(sectionsTable).where(eq(sectionsTable.id, id));
  },
};

// Mirrors the legacy DbParagraphs (crud.server.ts) against paragraphs_new while
// the migration is in flight. The old parent/child pairing does not exist here:
// a translation lives in the counterpart document of the same work and shares
// the source paragraph's passage_key.
export const DbParagraphsNew = {
  // ---- READ ----

  findById: async (id: string) => {
    return db.query.paragraphsTableNew.findFirst({
      where: eq(paragraphsTableNew.id, id),
    });
  },

  findByIds: async (ids: string[], limit?: number) => {
    if (!ids.length) return [];
    return db.query.paragraphsTableNew.findMany({
      where: inArray(paragraphsTableNew.id, ids),
      limit: limit,
    });
  },

  // Legacy findByIdsWithChildrenAndRelations analog: pulls the location context
  // (section → document → work, plus contributors) used to label search hits.
  findByIdsWithRelations: async (ids: string[], limit?: number) => {
    if (!ids.length) return [];
    return db.query.paragraphsTableNew.findMany({
      where: inArray(paragraphsTableNew.id, ids),
      limit: limit,
      with: {
        section: {
          columns: { title: true },
        },
        document: {
          columns: { title: true, language: true },
          with: {
            work: {
              columns: { title: true },
            },
            contributors: true,
          },
        },
      },
    });
  },

  findBySectionId: async (sectionId: string, limit?: number) => {
    return db.query.paragraphsTableNew.findMany({
      where: eq(paragraphsTableNew.sectionId, sectionId),
      limit: limit,
      orderBy: (paragraphs, { asc }) => [asc(paragraphs.order)],
    });
  },

  findByDocumentId: async (documentId: string, limit?: number) => {
    return db.query.paragraphsTableNew.findMany({
      where: eq(paragraphsTableNew.documentId, documentId),
      limit: limit,
      with: { section: true },
      orderBy: (paragraphs, { asc }) => [asc(paragraphs.order)],
    });
  },

  // Cross-document lookup used to pair a source paragraph with its translation.
  findByDocumentIdAndPassageKeys: async (documentId: string, passageKeys: string[]) => {
    if (!passageKeys.length) return [];
    return db.query.paragraphsTableNew.findMany({
      where: and(eq(paragraphsTableNew.documentId, documentId), inArray(paragraphsTableNew.passageKey, passageKeys)),
      orderBy: (paragraphs, { asc }) => [asc(paragraphs.order)],
    });
  },

  // ---- CREATE ----

  create: async (paragraph: CreateParagraphNew) => {
    return db.insert(paragraphsTableNew).values(paragraph).returning({ id: paragraphsTableNew.id });
  },

  createMany: async (paragraphs: CreateParagraphNew[]) => {
    if (!paragraphs.length) return [];
    return db.insert(paragraphsTableNew).values(paragraphs).returning({ id: paragraphsTableNew.id });
  },

  // ---- UPDATE ----

  updateById: async (id: string, data: Partial<CreateParagraphNew>) => {
    return db.update(paragraphsTableNew).set(data).where(eq(paragraphsTableNew.id, id));
  },

  updateByIds: async (ids: string[], data: Partial<CreateParagraphNew>) => {
    if (!ids.length) return;
    return db.update(paragraphsTableNew).set(data).where(inArray(paragraphsTableNew.id, ids));
  },

  // ---- DELETE ----

  deleteById: async (id: string) => {
    return db.delete(paragraphsTableNew).where(eq(paragraphsTableNew.id, id));
  },

  deleteByIds: async (ids: string[]) => {
    if (!ids.length) return;
    return db.delete(paragraphsTableNew).where(inArray(paragraphsTableNew.id, ids));
  },

  deleteBySectionId: async (sectionId: string) => {
    return db.delete(paragraphsTableNew).where(eq(paragraphsTableNew.sectionId, sectionId));
  },
};
