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

import { DbProjectReferences, DbProjects } from './project.crud';
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

// A work is deletable only once it holds nothing: its documents (and,
// transitively, every section, project and paragraph, which all require a
// document) must be gone first.
export const deleteWork = async ({ id }: { id: string }) => {
  const work = await DbWorks.findById(id);
  if (!work) {
    throw new Error('Work not found');
  }
  if (work.documents.length > 0) {
    throw new Error(
      `This work still has ${work.documents.length} document(s). Delete its documents before deleting the work.`,
    );
  }

  await DbWorks.deleteById(id);
  return { deletedWorkId: id };
};

// A document is deletable only when nothing references it: no sections, no
// paragraphs, and no project using it as source or target. Its contributors are
// owned metadata and are removed along with it.
export const deleteDocument = async ({ id }: { id: string }) => {
  const document = await DbDocuments.findById(id);
  if (!document) {
    throw new Error('Document not found');
  }
  if (document.sections.length > 0) {
    throw new Error(
      `This document still has ${document.sections.length} section(s). Delete its sections before deleting the document.`,
    );
  }

  const paragraphCount = await DbParagraphsNew.countByDocumentId(id);
  if (paragraphCount > 0) {
    throw new Error(
      `This document still has ${paragraphCount} paragraph(s). Remove them before deleting the document.`,
    );
  }

  const projects = await DbProjects.findByDocumentId(id);
  if (projects.length > 0) {
    throw new Error(
      `This document is used by ${projects.length} project(s). Remove those projects before deleting the document.`,
    );
  }

  // A document can also be attached to a project as a reference without being
  // its source or target, which the check above would miss.
  const referencingProjects = await DbProjectReferences.findByDocumentId(id);
  if (referencingProjects.length > 0) {
    throw new Error(
      `This document is a reference for ${referencingProjects.length} project(s). Remove it from those projects before deleting the document.`,
    );
  }

  // Contributors hang off the document and carry no independent meaning, so
  // they go with it.
  await DbContributors.deleteByDocumentId(id);
  await DbDocuments.deleteById(id);
  return { deletedDocumentId: id };
};

export const getDocuments = async () => {
  return DbDocuments.findAll();
};

// documentId → paragraph row count (including parked rows), for the
// paragraphs data-management document picker.
export const getDocumentParagraphCounts = async (): Promise<Map<string, number>> => {
  const rows = await DbParagraphsNew.countByDocument();
  return new Map(rows.map((r) => [r.documentId, r.count]));
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

// Section nesting (parent_id) only exists WITHIN one document. Translation
// counterparts are paired by order across the project's documents — never by
// parent/child links (that was the legacy roll model, and a former bug carried
// it over, producing stray order-0 sections parented across documents).
const assertParentInSameDocument = async (parentId: string, documentId: string) => {
  const parent = await DbSections.findById(parentId);
  if (!parent) {
    throw new Error(`Cannot set section parent: section ${parentId} not found`);
  }
  if (parent.documentId !== documentId) {
    throw new Error(
      'A section parent must belong to the same document. Translation counterparts are paired by order, not by parent/child links.',
    );
  }
};

export const createSection = async (
  section: Omit<CreateSection, 'createdBy' | 'updatedBy' | 'workId'>,
  user: ReadUser,
) => {
  const workId = await DbDocuments.findWorkId(section.documentId);
  if (!workId) {
    throw new Error(`Cannot create section: document ${section.documentId} not found`);
  }
  if (section.parentId) {
    await assertParentInSameDocument(section.parentId, section.documentId);
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
  if (data.parentId) {
    const documentId = data.documentId ?? (await DbSections.findById(id))?.documentId;
    if (!documentId) {
      throw new Error(`Cannot update section: section ${id} not found`);
    }
    await assertParentInSameDocument(data.parentId, documentId);
  }
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

export const getSectionIdsWithParagraphs = async (sectionIds: string[]) => {
  return DbParagraphsNew.findSectionIdsWithParagraphs(sectionIds);
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

// A source section's counterpart in the target document, matched by order —
// the same convention the index pages use to show source/target titles side by
// side. Returns null when it has not been created yet: imports and the
// translation workspace require the counterpart to be created and named in
// Data Management first, and never create sections implicitly.
export const findTargetSection = async ({
  sourceSection,
  targetDocumentId,
}: {
  sourceSection: { order: number };
  targetDocumentId: string;
}) => {
  const sections = await DbSections.findByDocumentId(targetDocumentId);
  return sections.find((s) => s.order === sourceSection.order) ?? null;
};

// Where a translation for the given source section should be written: the
// project's target document, in the counterpart section matched by order. Both
// the project and the counterpart section must already exist — sections are set
// up and named in Data Management and never created implicitly. The caller maps
// each failure reason to a user-facing message.
export type TranslationTarget =
  | { ok: true; targetDocumentId: string; targetSectionId: string }
  | { ok: false; reason: 'section-not-found' | 'no-project' | 'no-target-section' };

export const resolveTranslationTarget = async (sectionId: string): Promise<TranslationTarget> => {
  const section = await getSection(sectionId);
  if (!section) {
    return { ok: false, reason: 'section-not-found' };
  }
  const project = await DbProjects.findBySourceDocumentId(section.documentId);
  if (!project?.targetDocumentId) {
    return { ok: false, reason: 'no-project' };
  }
  const targetSection = await findTargetSection({
    sourceSection: { order: section.order },
    targetDocumentId: project.targetDocumentId,
  });
  if (!targetSection) {
    return { ok: false, reason: 'no-target-section' };
  }
  return { ok: true, targetDocumentId: project.targetDocumentId, targetSectionId: targetSection.id };
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

const toDebugRow = (paragraph: ReadParagraphNew): IParagraphNewDebugRow => ({
  id: paragraph.id,
  documentId: paragraph.documentId,
  sectionId: paragraph.sectionId,
  order: paragraph.order,
  passageKey: paragraph.passageKey,
  searchId: paragraph.searchId,
  content: paragraph.content,
  createdAt: paragraph.createdAt.toISOString(),
  updatedAt: paragraph.updatedAt.toISOString(),
});

// Every paragraph in a section, INCLUDING parked rows (order < 0) that reader
// views hide — for the paragraphs data-management page. Legacy
// readParagraphsForDebug analog.
export const readParagraphsForDebugBySectionId = async (sectionId: string): Promise<IParagraphNewDebugRow[]> => {
  const paragraphs = await DbParagraphsNew.findAllBySectionIdForDebug(sectionId);
  return paragraphs.map(toDebugRow);
};

// Every paragraph in a document, INCLUDING parked rows — the paragraphs
// data-management page groups these by section.
export const readParagraphsForDebugByDocumentId = async (documentId: string): Promise<IParagraphNewDebugRow[]> => {
  const paragraphs = await DbParagraphsNew.findAllByDocumentIdForDebug(documentId);
  return paragraphs.map(toDebugRow);
};

// Removes a section together with everything that hangs off it: all its
// paragraphs (including parked rows) and their search-index entries. Used by
// the paragraphs data-management page to clear stray sections. Refuses when
// the section still has child sections — those must be handled explicitly.
export const deleteSectionWithParagraphs = async ({ id }: { id: string }) => {
  const section = await DbSections.findById(id);
  if (!section) {
    throw new Error('Section not found');
  }
  if (section.children.length > 0) {
    throw new Error('This section has child sections. Delete or reassign them before deleting it.');
  }

  const paragraphs = await DbParagraphsNew.findAllBySectionIdForDebug(id);

  // Remove dependent rows before the section they reference.
  await DbParagraphsNew.deleteByIds(paragraphs.map((p) => p.id));
  await DbSections.deleteById(id);

  // Drop the search-index entries last; the DB is the source of truth.
  await deleteParagraphsFromAlgolia(paragraphs.map((p) => p.searchId));

  return { deletedParagraphCount: paragraphs.length };
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
