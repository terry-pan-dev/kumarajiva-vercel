import type { CreateDocument, CreateSection } from '~/drizzle/schema';
import type { ReadUser } from '~/drizzle/tables';

import { DbContributors, DbDocuments, DbSections } from './text.crud';

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

export const getContributorsByDocument = async (documentId: string) => {
  return DbContributors.findByDocumentId(documentId);
};
