import type { CreateProject } from '~/drizzle/schema';
import type { ReadUser } from '~/drizzle/tables';

import { DbProjects } from './project.crud';
import { DbDocuments } from './text.crud';
import { buildDocumentSections } from './text.service';

// Hydrates each project's documents with their own DocumentSection tree. Sections
// belong to the work and their titles are per-document (section_titles), so we
// project the shared work sections into a per-document tree — letting consumers
// treat sections as belonging to the document (the Option-1 shape).
export const getProjects = async () => {
  const projects = await DbProjects.findAll();
  return projects.map((project) => {
    const workSections = project.work?.sections ?? [];
    const { work: _work, ...rest } = project;
    return {
      ...rest,
      sourceDocument: {
        ...project.sourceDocument,
        sections: buildDocumentSections(workSections, project.sourceDocument.id),
      },
      targetDocument: {
        ...project.targetDocument,
        sections: buildDocumentSections(workSections, project.targetDocument.id),
      },
    };
  });
};

export const getProject = async (id: string) => {
  return DbProjects.findById(id);
};

export const createProject = async (
  project: Omit<CreateProject, 'createdBy' | 'updatedBy' | 'workId'>,
  user: ReadUser,
) => {
  const workId = await DbDocuments.findWorkId(project.sourceDocumentId);
  if (!workId) throw new Error(`Document ${project.sourceDocumentId} not found`);
  return DbProjects.create({ ...project, workId, createdBy: user.id, updatedBy: user.id });
};

export const updateProject = async (
  id: string,
  data: Partial<Omit<CreateProject, 'createdBy' | 'updatedBy'>>,
  user: ReadUser,
) => {
  return DbProjects.updateById(id, { ...data, updatedBy: user.id });
};
