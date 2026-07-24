import type { CreateProject } from '~/drizzle/schema';
import type { ReadUser } from '~/drizzle/tables';

import { DbProjectReferences, DbProjects } from './project.crud';
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

// A project is only a pairing of two documents, so deleting one leaves those
// documents, their sections and paragraphs untouched. Its reference rows are
// pure attachments — they carry no meaning without the project — so they go
// with it, and must go first: project_references.project_id is ON DELETE NO
// ACTION, so leaving them would make the delete fail outright.
export const deleteProject = async ({ id }: { id: string }) => {
  const project = await DbProjects.findById(id);
  if (!project) {
    throw new Error('Project not found');
  }

  await DbProjectReferences.deleteByProjectId(id);
  await DbProjects.deleteById(id);
  return { deletedProjectId: id };
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

// ---- REFERENCES ----
// Documents a project consults while translating: an earlier rendering, or a
// commentary. A reference need not belong to the project's work, so there is no
// work check here — only that it is not one of the two documents the project
// already translates between.

export const getProjectReferences = async (projectId: string) => {
  return DbProjectReferences.findByProjectId(projectId);
};

export const addProjectReference = async ({ projectId, documentId }: { projectId: string; documentId: string }) => {
  const project = await DbProjects.findById(projectId);
  if (!project) {
    throw new Error('Project not found');
  }
  if (documentId === project.sourceDocumentId || documentId === project.targetDocumentId) {
    throw new Error('This document is already the source or target of this project — it cannot also be a reference.');
  }

  const existing = await DbProjectReferences.findByProjectId(projectId);
  if (existing.some((reference) => reference.documentId === documentId)) {
    throw new Error('This document is already a reference for this project.');
  }

  // Append: order is a display sequence within the project, 1-based.
  const order = existing.reduce((max, reference) => Math.max(max, reference.order), 0) + 1;
  return DbProjectReferences.create({ projectId, documentId, order });
};

export const removeProjectReference = async ({ projectId, documentId }: { projectId: string; documentId: string }) => {
  await DbProjectReferences.delete(projectId, documentId);
  return { projectId, documentId };
};

// Reconcile a project's references to exactly `documentIds`, in the given order:
// insert the newly-added, drop the removed, and renumber the kept so `order`
// stays a dense 1-based sequence. Used by the project edit form, which submits
// the whole desired set rather than individual add/remove events.
export const syncProjectReferences = async ({
  projectId,
  documentIds,
}: {
  projectId: string;
  documentIds: string[];
}) => {
  const project = await DbProjects.findById(projectId);
  if (!project) {
    throw new Error('Project not found');
  }

  // A reference can be neither the source/target of the project nor listed twice.
  const seen = new Set<string>();
  const desired = documentIds.filter((id) => {
    if (id === project.sourceDocumentId || id === project.targetDocumentId) return false;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  const existing = await DbProjectReferences.findByProjectId(projectId);
  const existingIds = new Set(existing.map((reference) => reference.documentId));
  const desiredIds = new Set(desired);

  await Promise.all(
    existing
      .filter((reference) => !desiredIds.has(reference.documentId))
      .map((reference) => DbProjectReferences.delete(projectId, reference.documentId)),
  );

  await Promise.all(
    desired.map((documentId, index) =>
      existingIds.has(documentId)
        ? DbProjectReferences.updateOrder(projectId, documentId, index + 1)
        : DbProjectReferences.create({ projectId, documentId, order: index + 1 }),
    ),
  );

  return { projectId, count: desired.length };
};

export const reorderProjectReferences = async ({
  projectId,
  documentIds,
}: {
  projectId: string;
  documentIds: string[];
}) => {
  await Promise.all(
    documentIds.map((documentId, index) => DbProjectReferences.updateOrder(projectId, documentId, index + 1)),
  );
  return { projectId };
};
