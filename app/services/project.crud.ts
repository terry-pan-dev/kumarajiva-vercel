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
        work: {
          with: { sections: { with: { sectionTitles: true }, orderBy: (s, { asc }) => [asc(s.order)] } },
        },
        sourceDocument: { with: { contributors: true } },
        targetDocument: { with: { contributors: true } },
        team: true,
      },
    });
  },

  findAll: async () => {
    return db.query.projectsTable.findMany({
      with: {
        work: {
          with: { sections: { with: { sectionTitles: true }, orderBy: (s, { asc }) => [asc(s.order)] } },
        },
        sourceDocument: { with: { contributors: true } },
        targetDocument: { with: { contributors: true } },
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
