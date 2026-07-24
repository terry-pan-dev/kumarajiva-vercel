import type { CreateProject } from '~/drizzle/schema';
import type { ReadUser } from '~/drizzle/tables';

import { DbProjects } from './project.crud';
import { DbDocuments } from './text.crud';

export const getProjects = async () => {
  return DbProjects.findAll();
};

export const getProject = async (id: string) => {
  return DbProjects.findById(id);
};

export const getProjectBySourceDocumentId = async (sourceDocumentId: string) => {
  return DbProjects.findBySourceDocumentId(sourceDocumentId);
};

export const createProject = async (
  project: Omit<CreateProject, 'createdBy' | 'updatedBy' | 'workId'>,
  user: ReadUser,
) => {
  // A project's work is fixed by the documents it translates between; derive it
  // from the source document rather than making callers pass it separately.
  const workId = await DbDocuments.findWorkId(project.sourceDocumentId);
  if (!workId) {
    throw new Error(`Cannot create project: source document ${project.sourceDocumentId} not found`);
  }
  return DbProjects.create({ ...project, workId, createdBy: user.id, updatedBy: user.id });
};

export const updateProject = async (
  id: string,
  data: Partial<Omit<CreateProject, 'createdBy' | 'updatedBy' | 'workId'>>,
  user: ReadUser,
) => {
  // Keep the denormalised work_id aligned if the source document is reassigned.
  const workId = data.sourceDocumentId ? await DbDocuments.findWorkId(data.sourceDocumentId) : undefined;
  return DbProjects.updateById(id, { ...data, ...(workId ? { workId } : {}), updatedBy: user.id });
};
