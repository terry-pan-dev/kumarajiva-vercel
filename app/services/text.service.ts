import type { CreateDocument, CreateWork } from '~/drizzle/schema';
import type { ReadUser } from '~/drizzle/tables';

import { DbContributors, DbSectionTitles, DbSections, DbWorks, DbDocuments } from './text.crud';

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

// ─── Sections ────────────────────────────────────────────────────────────────
// Sections belong to the work and carry no title of their own; each document
// titles them via section_titles. A DocumentSection is a section resolved for
// one document — its title filled in and its rows nested by parentId/order — so
// the rest of the app can treat sections as belonging to the document (the
// Option-1 shape) even though the tables are work-scoped.
export type DocumentSection = {
  id: string;
  documentId: string;
  title: string | null;
  order: number;
  key: string | null;
  children: DocumentSection[];
};

type WorkSectionRow = {
  id: string;
  parentId: string | null;
  order: number;
  key: string | null;
  sectionTitles: Array<{ documentId: string; title: string | null }>;
};

// Projects the work's shared sections into a per-document DocumentSection tree.
export const buildDocumentSections = (sections: WorkSectionRow[], documentId: string): DocumentSection[] => {
  const titleFor = (s: WorkSectionRow) => s.sectionTitles.find((t) => t.documentId === documentId)?.title ?? null;

  const nodes = new Map<string, DocumentSection>(
    sections.map((s) => [s.id, { id: s.id, documentId, title: titleFor(s), order: s.order, key: s.key, children: [] }]),
  );

  const roots: DocumentSection[] = [];
  for (const s of sections) {
    const node = nodes.get(s.id)!;
    const parent = s.parentId ? nodes.get(s.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const sortByOrder = (list: DocumentSection[]) => {
    list.sort((a, b) => a.order - b.order);
    list.forEach((n) => sortByOrder(n.children));
  };
  sortByOrder(roots);
  return roots;
};

const findInTree = (nodes: DocumentSection[], id: string): DocumentSection | undefined => {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findInTree(node.children, id);
    if (found) return found;
  }
  return undefined;
};

// Sections as the given document sees them (mirrors Option-1 getSectionsByDocument).
export const getSectionsByDocument = async (documentId: string): Promise<DocumentSection[]> => {
  const sections = await DbSections.findByDocumentId(documentId);
  return buildDocumentSections(sections, documentId);
};

// One section as the given document sees it (mirrors Option-1 getSection). A
// section is shared across the work, so the document whose title to resolve
// must be given — that is the one shape change Option 2 forces on this call.
export const getSection = async (sectionId: string, documentId: string): Promise<DocumentSection | undefined> => {
  const sections = await getSectionsByDocument(documentId);
  return findInTree(sections, sectionId);
};

// The paragraph view is reached by section id alone (no document context), so it
// is labelled with the work title and one of the section's titles — enough for
// the reading-pane header and the docx filename.
export const getSectionHeading = async (
  sectionId: string,
): Promise<{ documentTitle: string; sectionTitle: string | null }> => {
  const section = await DbSections.findById(sectionId);
  if (!section) return { documentTitle: '', sectionTitle: null };
  return {
    documentTitle: section.work?.title ?? '',
    sectionTitle: section.sectionTitles[0]?.title ?? null,
  };
};

export const createSection = async (
  { documentId, parentId }: { documentId: string; parentId?: string | null },
  user: ReadUser,
) => {
  const workId = await DbDocuments.findWorkId(documentId);
  if (!workId) throw new Error(`Document ${documentId} not found`);
  const existingSections = await DbSections.findByWorkId(workId);
  const [{ id }] = await DbSections.create({
    workId,
    parentId: parentId ?? null,
    order: existingSections.length + 1,
    createdBy: user.id,
    updatedBy: user.id,
  });
  return id;
};

export const createSectionTitle = async (
  { sectionId, documentId, title }: { sectionId: string; documentId: string; title: string },
  user: ReadUser,
) => {
  return DbSectionTitles.create({ sectionId, documentId, title, createdBy: user.id, updatedBy: user.id });
};

export const updateSectionTitle = async (
  { sectionId, documentId, title }: { sectionId: string; documentId: string; title: string },
  user: ReadUser,
) => {
  const existing = await DbSectionTitles.findBySectionId(sectionId);
  const titleRow = existing.find((t) => t.documentId === documentId);
  if (!titleRow) throw new Error(`No section title found for section ${sectionId} and document ${documentId}`);
  return DbSectionTitles.updateById(titleRow.id, { title, updatedBy: user.id });
};

export const getAllWorks = async () => {
  return DbWorks.findAll();
};

export const getContributorsByDocument = async (documentId: string) => {
  return DbContributors.findByDocumentId(documentId);
};

export const reorderSections = async (updates: Array<{ id: string; order: number }>, user: ReadUser) => {
  return Promise.all(updates.map(({ id, order }) => DbSections.updateById(id, { order, updatedBy: user.id })));
};
