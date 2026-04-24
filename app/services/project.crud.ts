import { eq, inArray } from 'drizzle-orm';

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
