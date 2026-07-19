import type { CreateDocument, CreateSection, CreateWork } from '~/drizzle/schema';
import type { ReadUser } from '~/drizzle/tables';

import { DbContributors, DbDocuments, DbSections, DbWorks } from './text.crud';

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

export const createSection = async (
  section: Omit<CreateSection, 'createdBy' | 'updatedBy' | 'workId'>,
  user: ReadUser,
) => {
  const workId = await DbDocuments.findWorkId(section.documentId);
  if (!workId) {
    throw new Error(`Cannot create section: document ${section.documentId} not found`);
  }
  return DbSections.create({ ...section, workId, createdBy: user.id, updatedBy: user.id });
};

export const updateSection = async (
  id: string,
  data: Partial<Omit<CreateSection, 'createdBy' | 'updatedBy' | 'workId'>>,
  user: ReadUser,
) => {
  // If the section is moved to another document, keep the denormalised
  // work_id in step with its new document.
  const workId = data.documentId ? await DbDocuments.findWorkId(data.documentId) : undefined;
  return DbSections.updateById(id, { ...data, ...(workId ? { workId } : {}), updatedBy: user.id });
};

export const getContributorsByDocument = async (documentId: string) => {
  return DbContributors.findByDocumentId(documentId);
};

export const reorderSections = async (updates: Array<{ id: string; order: number }>, user: ReadUser) => {
  return Promise.all(updates.map(({ id, order }) => DbSections.updateById(id, { order, updatedBy: user.id })));
};
