import 'dotenv/config';
import { v4 as uuidv4 } from 'uuid';

import type {
  ReadHistory,
  CreateParagraph,
  ReadReference,
  CreateComment,
  ReadComment,
  UpdateComment,
} from '~/drizzle/schema';
import type { Lang } from '~/utils/constants';

import { DbComments, DbHistory, DbParagraphs, DbReferences } from './crud.server';
import { deleteParagraphsFromAlgolia, saveParagraphToAlgolia, updateParagraphToAlgolia } from './search.server';

export interface IParagraph {
  id: string;
  order?: string;
  origin: string;
  rollId: string;
  target: string | null;
  references: ReadReference[];
  histories: ReadHistory[];
  originComments: ReadComment[];
  targetComments: ReadComment[];
  targetId?: string;
}

export const readParagraphsByRollId = async ({
  rollId,
  limit,
}: {
  rollId: string;
  limit?: number;
}): Promise<IParagraph[]> => {
  const paragraphs = await DbParagraphs.findByRollIdWithChildren(rollId, limit);

  const result = paragraphs.map((paragraph) => ({
    ...paragraph,
    order: paragraph.order,
    origin: paragraph.content,
    target: paragraph.children?.content,
    histories: paragraph.children?.history || [],
    originComments: paragraph.comments || [],
    targetComments: paragraph.children?.comments || [],
    targetId: paragraph.children?.id,
  }));

  return result;
};

export const readParagraphsByRollIdForLanguage = async ({
  rollId,
  language,
  limit,
}: {
  rollId: string;
  language: Lang;
  limit?: number;
}): Promise<IParagraph[]> => {
  const paragraphs = await DbParagraphs.findByRollIdWithChildrenForLanguage(rollId, language, limit);

  const result = paragraphs.map((paragraph) => ({
    ...paragraph,
    order: paragraph.order,
    origin: paragraph.content,
    target: paragraph.children?.content,
    histories: paragraph.children?.history || [],
    originComments: paragraph.comments || [],
    targetComments: paragraph.children?.comments || [],
    targetId: paragraph.children?.id,
  }));

  return result;
};

export const updateParagraph = async ({
  id,
  newContent,
  updatedBy,
}: {
  id: string;
  newContent: string;
  updatedBy: string;
}) => {
  const existingParagraph = await DbParagraphs.findById(id);
  if (!existingParagraph) {
    throw new Error('Paragraph not found');
  }

  const paragraphData = {
    content: newContent,
    updatedBy: updatedBy,
  };

  const result = await DbParagraphs.updateById(existingParagraph.id, {
    content: newContent,
    updatedBy,
  });

  if (existingParagraph.searchId) {
    console.log('updating algolia', existingParagraph.searchId);
    await updateParagraphToAlgolia(existingParagraph.searchId, paragraphData);
  }

  return result;
};

export const insertParagraph = async ({
  parentId,
  newParagraph,
}: {
  parentId: string;
  newParagraph: CreateParagraph;
}) => {
  const originParagraph = await DbParagraphs.findByIdWithChildren(parentId);
  if (!originParagraph) {
    throw new Error('Paragraph not found');
  }
  const paragraphId = uuidv4();
  const objectId = uuidv4();
  console.log({ paragraphId, objectId });

  const newParagraphData = {
    id: paragraphId,
    ...newParagraph,
    order: originParagraph?.order,
    rollId: originParagraph?.rollId,
    searchId: objectId,
  };

  const result = await DbParagraphs.create(newParagraphData);
  await saveParagraphToAlgolia(newParagraphData);

  return result;
};

export interface IParagraphDebugRow {
  id: string;
  parentId: string | null;
  rollId: string;
  number: number;
  order: string;
  language: string;
  searchId: string | null;
  content: string;
  isOrigin: boolean;
  referenceCount: number;
  commentCount: number;
  historyCount: number;
  createdAt: string;
  updatedAt: string;
}

// Reads every paragraph in a roll — including corrupt rows the reader views
// hide (negative order/number, duplicates, orphans) — for the paragraph debug
// page. See [[crud.server]] `findAllByRollIdForDebug`.
export const readParagraphsForDebug = async (rollId: string): Promise<IParagraphDebugRow[]> => {
  const paragraphs = await DbParagraphs.findAllByRollIdForDebug(rollId);

  return paragraphs.map((paragraph) => ({
    id: paragraph.id,
    parentId: paragraph.parentId,
    rollId: paragraph.rollId,
    number: paragraph.number,
    order: paragraph.order,
    language: paragraph.language,
    searchId: paragraph.searchId,
    content: paragraph.content,
    isOrigin: paragraph.parentId === null,
    referenceCount: paragraph.references.length,
    commentCount: paragraph.comments.length,
    historyCount: paragraph.history.length,
    createdAt: paragraph.createdAt.toISOString(),
    updatedAt: paragraph.updatedAt.toISOString(),
  }));
};

export interface DeleteParagraphResult {
  deletedParagraphIds: string[];
  deletedChild: boolean;
}

// Cleanly removes a paragraph and everything that hangs off it: its translation
// child (when an origin is removed), plus the references, comments, history
// rows, and Algolia search entries for every deleted paragraph. Used by the
// paragraph debug page to clear corrupt data without leaving orphans behind.
export const deleteParagraphCleanly = async ({ id }: { id: string }): Promise<DeleteParagraphResult> => {
  const paragraph = await DbParagraphs.findByIdWithChildren(id);
  if (!paragraph) {
    throw new Error('Paragraph not found');
  }

  const child = paragraph.children ?? null;
  const childIds = child ? [child.id] : [];
  const allIds = [id, ...childIds];
  const searchIds = [paragraph.searchId, child?.searchId ?? null];

  // Remove dependent rows before the paragraphs they reference.
  await DbReferences.deleteByParagraphIds(allIds);
  await DbComments.deleteByParagraphIds(allIds);
  await DbHistory.deleteByParagraphIds(allIds);

  // Delete the translation child first — it references the origin via parent_id.
  if (childIds.length) {
    await DbParagraphs.deleteByIds(childIds);
  }
  await DbParagraphs.deleteById(id);

  // Drop the search-index entries last; the DB is the source of truth.
  await deleteParagraphsFromAlgolia(searchIds);

  return { deletedParagraphIds: allIds, deletedChild: childIds.length > 0 };
};

export const createComment = async (newComment: CreateComment) => {
  const result = await DbComments.create({
    ...newComment,
  });
  return result;
};

export const updateComment = async ({
  id,
  messages,
  resolved,
  updatedBy,
}: Required<Pick<UpdateComment, 'id' | 'messages' | 'resolved' | 'updatedBy'>>) => {
  const existingComment = await DbComments.findById(id);
  if (!existingComment) {
    throw new Error('Comment not found');
  }
  const newMessages = [...(existingComment.messages || []), ...(messages || [])];
  const result = await DbComments.updateById(id, {
    messages: newMessages,
    resolved: resolved,
    updatedBy: updatedBy,
  });

  return result;
};
