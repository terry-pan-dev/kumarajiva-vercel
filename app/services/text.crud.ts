import { eq, inArray } from 'drizzle-orm';

import type {
  CreateContributor,
  CreateDocument,
  CreateSection,
  CreateSectionTitle,
  CreateWork,
} from '~/drizzle/schema';

import { contributorsTable, documentsTable, sectionTitlesTable, sectionsTable, worksTable } from '~/drizzle/schema';
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
        work: {
          with: { sections: { with: { sectionTitles: true }, orderBy: (s, { asc }) => [asc(s.order)] } },
        },
      },
    });
  },

  findById: async (id: string) => {
    return db.query.documentsTable.findFirst({
      where: eq(documentsTable.id, id),
      with: {
        contributors: true,
        work: {
          with: { sections: { with: { sectionTitles: true }, orderBy: (s, { asc }) => [asc(s.order)] } },
        },
      },
    });
  },

  findByWorkId: async (workId: string) => {
    return db.query.documentsTable.findMany({
      where: eq(documentsTable.workId, workId),
      with: {
        contributors: true,
        work: {
          with: { sections: { with: { sectionTitles: true }, orderBy: (s, { asc }) => [asc(s.order)] } },
        },
      },
    });
  },

  findWorkId: async (id: string) => {
    const doc = await db.query.documentsTable.findFirst({
      where: eq(documentsTable.id, id),
      columns: { workId: true },
    });
    return doc?.workId ?? null;
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
        work: true,
        children: true,
        sectionTitles: true,
      },
    });
  },

  findByIds: async (ids: string[]) => {
    if (!ids.length) return [];
    return db.query.sectionsTable.findMany({
      where: inArray(sectionsTable.id, ids),
      with: { children: true, sectionTitles: true },
    });
  },

  findByWorkId: async (workId: string) => {
    return db.query.sectionsTable.findMany({
      where: eq(sectionsTable.workId, workId),
      with: { children: true, sectionTitles: true },
      orderBy: (sections, { asc }) => [asc(sections.order)],
    });
  },

  findByDocumentId: async (documentId: string) => {
    const doc = await db.query.documentsTable.findFirst({
      where: eq(documentsTable.id, documentId),
      columns: { workId: true },
    });
    if (!doc) return [];
    return DbSections.findByWorkId(doc.workId);
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

export const DbSectionTitles = {
  findById: async (id: string) => {
    return db.query.sectionTitlesTable.findFirst({
      where: eq(sectionTitlesTable.id, id),
      with: { section: true, document: true },
    });
  },

  findBySectionId: async (sectionId: string) => {
    return db.query.sectionTitlesTable.findMany({
      where: eq(sectionTitlesTable.sectionId, sectionId),
    });
  },

  findByDocumentId: async (documentId: string) => {
    const titles = await db.query.sectionTitlesTable.findMany({
      where: eq(sectionTitlesTable.documentId, documentId),
      with: { section: true },
    });
    return titles.sort((a, b) => (a.section?.order ?? 0) - (b.section?.order ?? 0));
  },

  create: async (sectionTitle: CreateSectionTitle) => {
    return db.insert(sectionTitlesTable).values(sectionTitle).returning({ id: sectionTitlesTable.id });
  },

  createMany: async (sectionTitles: CreateSectionTitle[]) => {
    if (!sectionTitles.length) return [];
    return db.insert(sectionTitlesTable).values(sectionTitles).returning({ id: sectionTitlesTable.id });
  },

  updateById: async (id: string, data: Partial<CreateSectionTitle>) => {
    return db.update(sectionTitlesTable).set(data).where(eq(sectionTitlesTable.id, id));
  },

  deleteById: async (id: string) => {
    return db.delete(sectionTitlesTable).where(eq(sectionTitlesTable.id, id));
  },

  deleteBySectionId: async (sectionId: string) => {
    return db.delete(sectionTitlesTable).where(eq(sectionTitlesTable.sectionId, sectionId));
  },
};
