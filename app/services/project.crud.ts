import { eq, inArray, or } from 'drizzle-orm';

import type { CreateProject } from '~/drizzle/schema';

import { projectsTable } from '~/drizzle/schema';
import { getDb } from '~/lib/db.server';

const db = getDb();

export const DbProjects = {
  findById: async (id: string) => {
    return db.query.projectsTable.findFirst({
      where: eq(projectsTable.id, id),
      with: {
        sourceDocument: {
          with: {
            contributors: true,
            sections: {
              with: { children: true },
              orderBy: (sections, { asc }) => [asc(sections.order)],
            },
          },
        },
        targetDocument: {
          with: {
            contributors: true,
            sections: {
              with: { children: true },
              orderBy: (sections, { asc }) => [asc(sections.order)],
            },
          },
        },
        team: true,
      },
    });
  },

  findAll: async () => {
    return db.query.projectsTable.findMany({
      with: {
        sourceDocument: {
          with: {
            contributors: true,
            sections: {
              with: { children: true },
              orderBy: (sections, { asc }) => [asc(sections.order)],
            },
          },
        },
        targetDocument: {
          with: {
            contributors: true,
            sections: {
              with: { children: true },
              orderBy: (sections, { asc }) => [asc(sections.order)],
            },
          },
        },
        team: true,
      },
    });
  },

  findByIds: async (ids: string[]) => {
    if (!ids.length) return [];
    return db.query.projectsTable.findMany({
      where: inArray(projectsTable.id, ids),
    });
  },

  // The translation pages resolve a source section's counterpart by looking up
  // the project that translates its document; target sections are matched by
  // order within the target document.
  findBySourceDocumentId: async (sourceDocumentId: string) => {
    return db.query.projectsTable.findFirst({
      where: eq(projectsTable.sourceDocumentId, sourceDocumentId),
      with: {
        sourceDocument: true,
        targetDocument: {
          with: {
            sections: {
              orderBy: (sections, { asc }) => [asc(sections.order)],
            },
          },
        },
      },
    });
  },

  // Every project that references this document as its source OR target — used
  // to block deleting a document that a project still depends on.
  findByDocumentId: async (documentId: string) => {
    return db.query.projectsTable.findMany({
      where: or(eq(projectsTable.sourceDocumentId, documentId), eq(projectsTable.targetDocumentId, documentId)),
    });
  },

  create: async (project: CreateProject) => {
    return db.insert(projectsTable).values(project).returning({ id: projectsTable.id });
  },

  updateById: async (id: string, data: Partial<CreateProject>) => {
    return db.update(projectsTable).set(data).where(eq(projectsTable.id, id));
  },

  deleteById: async (id: string) => {
    return db.delete(projectsTable).where(eq(projectsTable.id, id));
  },
};
