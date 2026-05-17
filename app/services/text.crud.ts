import { eq, inArray } from 'drizzle-orm';

import type { CreateContributor, CreateDocument, CreateSection } from '~/drizzle/schema';

import { contributorsTable, documentsTable, sectionsTable, worksTable } from '~/drizzle/schema';
import { getDb } from '~/lib/db.server';

const db = getDb();

export const DbWorks = {
  findById: async (id: string) => {
    return db.query.worksTable.findFirst({
      where: eq(worksTable.id, id),
      with: { documents: true },
    });
  },

  findAll: async () => {
    return db.query.worksTable.findMany({
      with: { documents: true },
    });
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

  deleteById: async (id: string) => {
    return db.delete(contributorsTable).where(eq(contributorsTable.id, id));
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
