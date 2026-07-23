import { v4 as uuidv4 } from 'uuid';

import type {
  CreateDocument,
  CreateParagraphNew,
  CreateSection,
  CreateWork,
  ReadComment,
  ReadHistory,
  ReadParagraphNew,
  ReadReference,
} from '~/drizzle/schema';
import type { ReadUser } from '~/drizzle/tables';

import { deleteParagraphsFromAlgolia, saveParagraphToAlgolia, updateParagraphToAlgolia } from './search.server';
import { DbContributors, DbDocuments, DbParagraphsNew, DbSections, DbWorks } from './text.crud';

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

// ─── Paragraphs (paragraphs_new) ─────────────────────────────────────────────
//
// Mirrors the legacy paragraph.service API during the migration, but against
// the refactored tables (work / document / section / paragraphs_new /
// contributors). The legacy origin→children pairing is replaced by passage_key
// alignment: a translation lives in the project's target document and carries
// the same passage_key as its source paragraph.

// Same consumer-facing shape as the legacy IParagraph so readers can swap over.
export interface IParagraphNew {
  id: string;
  order: number;
  passageKey: string | null;
  documentId: string;
  sectionId: string;
  origin: string;
  target: string | null;
  targetId?: string;
  references: ReadReference[];
  histories: ReadHistory[];
  originComments: ReadComment[];
  targetComments: ReadComment[];
}

const toIParagraph = (paragraph: ReadParagraphNew, target?: ReadParagraphNew): IParagraphNew => ({
  ...paragraph,
  origin: paragraph.content,
  target: target?.content ?? null,
  targetId: target?.id,
  // References, comments and history still hang off the legacy paragraphs
  // table; they move over in a later migration step.
  references: [],
  histories: [],
  originComments: [],
  targetComments: [],
});

// Legacy readParagraphsByRollId analog: a section takes the roll's place. Pass
// targetDocumentId (from the project) to pair each source paragraph with its
// translation by passage_key.
export const readParagraphsBySectionId = async ({
  sectionId,
  targetDocumentId,
  limit,
}: {
  sectionId: string;
  targetDocumentId?: string;
  limit?: number;
}): Promise<IParagraphNew[]> => {
  const paragraphs = await DbParagraphsNew.findBySectionId(sectionId, limit);

  const targetByPassageKey = await findTargetsByPassageKey(paragraphs, targetDocumentId);

  return paragraphs.map((paragraph) =>
    toIParagraph(paragraph, paragraph.passageKey ? targetByPassageKey.get(paragraph.passageKey) : undefined),
  );
};

// Legacy readParagraphsByRollIdForLanguage analog: language now lives on the
// document, so reading one language's text means reading its document.
export const readParagraphsByDocumentId = async ({
  documentId,
  targetDocumentId,
  limit,
}: {
  documentId: string;
  targetDocumentId?: string;
  limit?: number;
}): Promise<IParagraphNew[]> => {
  const paragraphs = await DbParagraphsNew.findByDocumentId(documentId, limit);

  const targetByPassageKey = await findTargetsByPassageKey(paragraphs, targetDocumentId);

  return paragraphs.map((paragraph) =>
    toIParagraph(paragraph, paragraph.passageKey ? targetByPassageKey.get(paragraph.passageKey) : undefined),
  );
};

const findTargetsByPassageKey = async (paragraphs: ReadParagraphNew[], targetDocumentId?: string) => {
  if (!targetDocumentId) return new Map<string, ReadParagraphNew>();
  const passageKeys = paragraphs.map((p) => p.passageKey).filter((key): key is string => Boolean(key));
  const targets = await DbParagraphsNew.findByDocumentIdAndPassageKeys(targetDocumentId, passageKeys);
  return new Map(targets.filter((t) => t.passageKey).map((t) => [t.passageKey as string, t]));
};

export const getParagraph = async (id: string) => {
  return DbParagraphsNew.findById(id);
};

// Legacy updateParagraph analog — same signature, same Algolia sync.
export const updateParagraph = async ({
  id,
  newContent,
  updatedBy,
}: {
  id: string;
  newContent: string;
  updatedBy: string;
}) => {
  const existingParagraph = await DbParagraphsNew.findById(id);
  if (!existingParagraph) {
    throw new Error('Paragraph not found');
  }

  const paragraphData = {
    content: newContent,
    updatedBy: updatedBy,
  };

  const result = await DbParagraphsNew.updateById(existingParagraph.id, paragraphData);

  if (existingParagraph.searchId) {
    await updateParagraphToAlgolia(existingParagraph.searchId, paragraphData);
  }

  return result;
};

// Legacy insertParagraph analog: creates the translation of a source paragraph.
// Instead of hanging off parentId, the new row goes into the target document's
// section and inherits the source paragraph's order and passage_key.
export const insertParagraph = async ({
  sourceId,
  documentId,
  sectionId,
  newParagraph,
}: {
  sourceId: string;
  documentId: string;
  sectionId: string;
  newParagraph: Pick<CreateParagraphNew, 'content' | 'createdBy' | 'updatedBy'>;
}) => {
  const sourceParagraph = await DbParagraphsNew.findById(sourceId);
  if (!sourceParagraph) {
    throw new Error('Paragraph not found');
  }

  const newParagraphData: CreateParagraphNew = {
    id: uuidv4(),
    ...newParagraph,
    documentId,
    sectionId,
    order: sourceParagraph.order,
    passageKey: sourceParagraph.passageKey,
    searchId: uuidv4(),
  };

  const result = await DbParagraphsNew.create(newParagraphData);
  await saveParagraphToAlgolia(newParagraphData);

  return result;
};

export const createParagraphs = async (
  paragraphs: Array<Omit<CreateParagraphNew, 'createdBy' | 'updatedBy'>>,
  user: ReadUser,
) => {
  return DbParagraphsNew.createMany(paragraphs.map((p) => ({ ...p, createdBy: user.id, updatedBy: user.id })));
};

// A source section's counterpart in the target document is matched by order
// (the same convention the index pages use to show source/target titles side
// by side). Creates the target section on first use so translating or
// importing into a fresh document just works.
export const findOrCreateTargetSection = async ({
  sourceSection,
  targetDocumentId,
  userId,
}: {
  sourceSection: { order: number; title: string | null };
  targetDocumentId: string;
  userId: string;
}): Promise<{ id: string; created: boolean }> => {
  const sections = await DbSections.findByDocumentId(targetDocumentId);
  const existing = sections.find((s) => s.order === sourceSection.order);
  if (existing) {
    return { id: existing.id, created: false };
  }

  const workId = await DbDocuments.findWorkId(targetDocumentId);
  if (!workId) {
    throw new Error(`Cannot create target section: document ${targetDocumentId} not found`);
  }
  const [created] = await DbSections.create({
    documentId: targetDocumentId,
    workId,
    title: sourceSection.title,
    order: sourceSection.order,
    createdBy: userId,
    updatedBy: userId,
  });
  return { id: created.id, created: true };
};

export interface IParagraphNewDebugRow {
  id: string;
  documentId: string;
  sectionId: string;
  order: number;
  passageKey: string | null;
  searchId: string | null;
  content: string;
  createdAt: string;
  updatedAt: string;
}

// Every paragraph in a section, INCLUDING parked rows (order < 0) that reader
// views hide — for the paragraphs data-management page. Legacy
// readParagraphsForDebug analog.
export const readParagraphsForDebugBySectionId = async (sectionId: string): Promise<IParagraphNewDebugRow[]> => {
  const paragraphs = await DbParagraphsNew.findAllBySectionIdForDebug(sectionId);

  return paragraphs.map((paragraph) => ({
    id: paragraph.id,
    documentId: paragraph.documentId,
    sectionId: paragraph.sectionId,
    order: paragraph.order,
    passageKey: paragraph.passageKey,
    searchId: paragraph.searchId,
    content: paragraph.content,
    createdAt: paragraph.createdAt.toISOString(),
    updatedAt: paragraph.updatedAt.toISOString(),
  }));
};

// Legacy deleteParagraphCleanly analog. No parent/child rows to cascade here;
// dependents (references/comments/history) still live on the legacy tables.
export const deleteParagraph = async ({ id }: { id: string }) => {
  const paragraph = await DbParagraphsNew.findById(id);
  if (!paragraph) {
    throw new Error('Paragraph not found');
  }

  await DbParagraphsNew.deleteById(id);
  await deleteParagraphsFromAlgolia([paragraph.searchId]);

  return { deletedParagraphIds: [id] };
};
