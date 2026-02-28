import 'dotenv/config';
import { v4 as uuidv4 } from 'uuid';

import type {
  ReadHistory,
  CreateParagraph,
  ReadReference,
  CreateComment,
  ReadComment,
  UpdateComment,
  ReadUser,
} from '~/drizzle/schema';

import { DbComments, DbParagraphs } from './crud.server';
import { saveParagraphToAlgolia, updateParagraphToAlgolia } from './search.server';

export interface IParagraph {
  id: string;
  order?: string;
  origin: string;
  rollId: string;
  target?: string;
  references: ReadReference[];
  histories: ReadHistory[];
  originComments: ReadComment[];
  targetComments: ReadComment[];
  targetId?: string;
}

export const readParagraphsByRollId = async (rollId: string, limit?: number): Promise<IParagraph[]> => {
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

export const readParagraphsByRollIdForUser = async (
  rollId: string,
  user: ReadUser,
  limit?: number,
): Promise<IParagraph[]> => {
  const paragraphs = await DbParagraphs.findByRollIdWithChildrenForUser(rollId, user, limit);

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
