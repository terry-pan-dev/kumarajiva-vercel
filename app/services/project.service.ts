import type { CreateProject } from '~/drizzle/schema';
import type { ReadUser } from '~/drizzle/tables';

import { DbProjects } from './project.crud';

export const getProjects = async () => {
  return DbProjects.findAll();
};

export const getProject = async (id: string) => {
  return DbProjects.findById(id);
};

export const createProject = async (project: Omit<CreateProject, 'createdBy' | 'updatedBy'>, user: ReadUser) => {
  return DbProjects.create({ ...project, createdBy: user.id, updatedBy: user.id });
};

export const updateProject = async (
  id: string,
  data: Partial<Omit<CreateProject, 'createdBy' | 'updatedBy'>>,
  user: ReadUser,
) => {
  return DbProjects.updateById(id, { ...data, updatedBy: user.id });
};
