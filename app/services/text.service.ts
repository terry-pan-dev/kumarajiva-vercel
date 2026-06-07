import type { CreateDocument, CreateSection, CreateWork } from '~/drizzle/schema';
import type { ReadUser } from '~/drizzle/tables';

import { DbDocuments, DbSections, DbWorks } from './text.crud';

export const getWorks = async () => {
  return DbWorks.findAll();
};

export const createWork = async (work: Omit<CreateWork, 'createdBy' | 'updatedBy'>, user: ReadUser) => {
  return DbWorks.create({ ...work, createdBy: user.id, updatedBy: user.id });
};

export const updateWork = async (
  id: string,
  data: Partial<Omit<CreateWork, 'createdBy' | 'updatedBy'>>,
  user: ReadUser,
) => {
  return DbWorks.updateById(id, { ...data, updatedBy: user.id });
};

export const getDocument = async (id: string) => {
  return DbDocuments.findById(id);
};

export const getDocumentsByWork = async (workId: string) => {
  return DbDocuments.findByWorkId(workId);
};

export const createDocument = async (document: Omit<CreateDocument, 'createdBy' | 'updatedBy'>, user: ReadUser) => {
  return DbDocuments.create({ ...document, createdBy: user.id, updatedBy: user.id });
};

export const updateDocument = async (
  id: string,
  data: Partial<Omit<CreateDocument, 'createdBy' | 'updatedBy'>>,
  user: ReadUser,
) => {
  return DbDocuments.updateById(id, { ...data, updatedBy: user.id });
};

export const getSection = async (id: string) => {
  return DbSections.findById(id);
};

export const getSectionsByDocument = async (documentId: string) => {
  return DbSections.findByDocumentId(documentId);
};

export const createSection = async (section: Omit<CreateSection, 'createdBy' | 'updatedBy'>, user: ReadUser) => {
  return DbSections.create({ ...section, createdBy: user.id, updatedBy: user.id });
};

export const updateSection = async (
  id: string,
  data: Partial<Omit<CreateSection, 'createdBy' | 'updatedBy'>>,
  user: ReadUser,
) => {
  return DbSections.updateById(id, { ...data, updatedBy: user.id });
};
