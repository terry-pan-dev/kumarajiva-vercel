import { and, eq, inArray, or } from 'drizzle-orm';

import type { CreateProject, CreateProjectReference } from '~/drizzle/schema';

import { projectReferencesTable, projectsTable } from '~/drizzle/schema';
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
        references: {
          with: {
            document: {
              with: {
                sections: {
                  orderBy: (sections, { asc }) => [asc(sections.order)],
                },
              },
            },
          },
          orderBy: (references, { asc }) => [asc(references.order)],
        },
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
        references: {
          with: {
            document: {
              with: {
                sections: {
                  orderBy: (sections, { asc }) => [asc(sections.order)],
                },
              },
            },
          },
          orderBy: (references, { asc }) => [asc(references.order)],
        },
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

export const DbProjectReferences = {
  findByProjectId: async (projectId: string) => {
    return db.query.projectReferencesTable.findMany({
      where: eq(projectReferencesTable.projectId, projectId),
      with: { document: { with: { contributors: true } } },
      orderBy: (references, { asc }) => [asc(references.order)],
    });
  },

  // Every project that attached this document as a reference — used to block
  // deleting a document a project still consults.
  findByDocumentId: async (documentId: string) => {
    return db.query.projectReferencesTable.findMany({
      where: eq(projectReferencesTable.documentId, documentId),
    });
  },

  create: async (reference: CreateProjectReference) => {
    return db.insert(projectReferencesTable).values(reference).returning();
  },

  updateOrder: async (projectId: string, documentId: string, order: number) => {
    return db
      .update(projectReferencesTable)
      .set({ order })
      .where(and(eq(projectReferencesTable.projectId, projectId), eq(projectReferencesTable.documentId, documentId)));
  },

  delete: async (projectId: string, documentId: string) => {
    return db
      .delete(projectReferencesTable)
      .where(and(eq(projectReferencesTable.projectId, projectId), eq(projectReferencesTable.documentId, documentId)));
  },

  deleteByProjectId: async (projectId: string) => {
    return db.delete(projectReferencesTable).where(eq(projectReferencesTable.projectId, projectId));
  },
};
