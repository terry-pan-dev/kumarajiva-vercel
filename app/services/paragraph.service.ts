import type { SearchQuery } from '@algolia/client-search';

import { sql as postgresql } from '@vercel/postgres';
import { and, eq, getTableColumns, inArray, isNull } from 'drizzle-orm';
import 'dotenv/config';
import { alias } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/vercel-postgres';
import { v4 as uuidv4 } from 'uuid';

import type {
  ReadHistory,
  CreateParagraph,
  ReadParagraph,
  ReadReference,
  ReadGlossary,
  CreateComment,
  ReadComment,
  UpdateComment,
} from '~/drizzle/schema';

import {
  commentsTable,
  glossariesTable,
  paragraphsTable,
  rollsTable,
  sutrasTable,
  referencesTable,
} from '~/drizzle/schema';
import * as schema from '~/drizzle/schema';

import { type SearchResultListProps } from '../components/SideBarMenu';
import algoliaClient from '../providers/algolia';

const dbClient = drizzle(postgresql, { schema });

export interface IParagraph {
  id: string;
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
  user,
}: {
  rollId: string;
  user: schema.ReadUser;
}): Promise<IParagraph[]> => {
  const paragraphs = await dbClient.query.paragraphsTable.findMany({
    where: (paragraphs, { eq, and }) => and(eq(paragraphs.rollId, rollId), eq(paragraphs.language, user.originLang)),
    with: {
      children: {
        with: {
          history: {
            orderBy: (history, { desc }) => [desc(history.updatedAt)],
          },
          comments: {
            where: (comments, { eq }) => eq(comments.resolved, false),
          },
        },
      },
      references: {
        orderBy: (references, { asc }) => [asc(references.order)],
      },
      comments: {
        where: (comments, { eq }) => eq(comments.resolved, false),
      },
    },
    orderBy: (paragraphs, { asc }) => [asc(paragraphs.number), asc(paragraphs.order)],
  });

  const result = paragraphs.map((paragraph) => ({
    ...paragraph,
    origin: paragraph.content,
    target: paragraph.children?.content,
    histories: paragraph.children?.history || [],
    originComments: paragraph.comments || [],
    targetComments: paragraph.children?.comments || [],
    targetId: paragraph.children?.id,
  }));

  return result;
};

export const readParagraphsAndReferencesByRollId = async (rollId: string) => {
  return dbClient.query.paragraphsTable.findMany({
    where: (paragraphs, { eq }) => and(eq(paragraphs.rollId, rollId), isNull(paragraphs.parentId)),
    orderBy: (paragraphs, { asc }) => [asc(paragraphs.order)],
    with: {
      parent: true,
      references: {
        orderBy: (references, { asc }) => [asc(references.order)],
      },
    },
  });
};

export type ParagraphSearchResult = Awaited<ReturnType<typeof queryParagraphs>>;

const queryParagraphs = (ids: string[], numberOfHits: number) => {
  const children = alias(paragraphsTable, 'children');
  const parent = alias(paragraphsTable, 'parent');
  const roll = alias(rollsTable, 'roll');
  const sutra = alias(sutrasTable, 'sutra');
  return dbClient
    .select({
      ...getTableColumns(paragraphsTable),
      children: {
        content: children.content,
        language: children.language,
      },
      parent: {
        content: parent.content,
        language: parent.language,
      },
      roll: {
        title: roll.title,
      },
      sutra: {
        title: sutra.title,
      },
    })
    .from(paragraphsTable)
    .leftJoin(children, eq(paragraphsTable.id, children.parentId))
    .leftJoin(parent, eq(paragraphsTable.id, parent.id))
    .leftJoin(roll, eq(paragraphsTable.rollId, roll.id))
    .leftJoin(sutra, eq(roll.sutraId, sutra.id))
    .where(inArray(paragraphsTable.id, ids))
    .limit(numberOfHits);
};

export const searchAlgolia = async ({
  searchTerm,
  searchType,
}: {
  searchTerm: string;
  searchType?: 'Glossary' | 'Paragraph' | null;
}): Promise<SearchResultListProps['results']> => {
  const numberOfHits = 10;
  const paragraphsIndexExist = await algoliaClient.indexExists({ indexName: 'paragraphs' });
  const glossariesIndexExist = await algoliaClient.indexExists({ indexName: 'glossaries' });
  if (!paragraphsIndexExist && !glossariesIndexExist) {
    return [];
  }
  let searchQuery: SearchQuery[] = [];
  if (searchType === 'Paragraph') {
    searchQuery.push({
      indexName: 'paragraphs',
      query: searchTerm,
      hitsPerPage: numberOfHits,
    });
  } else if (searchType === 'Glossary') {
    searchQuery.push({
      indexName: 'glossaries',
      query: searchTerm,
      hitsPerPage: numberOfHits,
    });
  } else {
    searchQuery.push({
      indexName: 'paragraphs',
      query: searchTerm,
      hitsPerPage: numberOfHits,
    });
    searchQuery.push({
      indexName: 'glossaries',
      query: searchTerm,
      hitsPerPage: numberOfHits,
    });
  }
  const { results } = await algoliaClient.search<ReadParagraph>({
    requests: searchQuery,
  });

  let ids: string[] = [];
  let searchResults: SearchResultListProps['results'] = [];
  if (results.length) {
    for (const result of results) {
      if ('hits' in result) {
        if (result.index === 'paragraphs') {
          ids = result.hits.map((hit) => hit.id);
          const paragraphs = await queryParagraphs(ids, numberOfHits);
          // reorder the results based on the ids and filter out undefined values
          const reorderedResults = ids
            .map((id) => paragraphs?.find((p) => p.id === id))
            .filter((result) => result !== undefined); // Type guard to ensure result is ReadParagraph
          searchResults.push(...reorderedResults?.map((p) => ({ ...p, type: 'Paragraph' as const })));
        }
        if (result.index === 'glossaries') {
          ids = result.hits.map((hit) => hit.id);
          const glossaries = await dbClient
            .select()
            .from(glossariesTable)
            .where(inArray(glossariesTable.id, ids))
            .limit(numberOfHits);
          // reorder the results based on the ids and filter out undefined values
          const reorderedResults = ids
            .map((id) => glossaries?.find((g) => g.id === id))
            .filter((result): result is ReadGlossary => result !== undefined); // Type guard to ensure result is ReadGlossary
          searchResults.push(...reorderedResults?.map((g) => ({ ...g, type: 'Glossary' as const })));
        }
      }
    }
  }
  return searchResults;
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
  const existingParagraph = await dbClient.query.paragraphsTable.findFirst({
    where: (paragraphs, { eq }) => eq(paragraphs.id, id),
  });
  if (!existingParagraph) {
    throw new Error('Paragraph not found');
  }

  if (existingParagraph.searchId) {
    console.log('updating algolia', existingParagraph.searchId);
    await algoliaClient.partialUpdateObject({
      indexName: 'paragraphs',
      objectID: existingParagraph.searchId,
      attributesToUpdate: {
        content: newContent,
        updatedBy,
      },
    });
  }
  const result = await dbClient
    .update(paragraphsTable)
    .set({
      content: newContent,
      updatedBy,
    })
    .where(eq(paragraphsTable.id, existingParagraph.id));

  return result;
};

export const insertParagraph = async ({
  parentId,
  newParagraph,
}: {
  parentId: string;
  newParagraph: CreateParagraph;
}) => {
  const originParagraph = await dbClient.query.paragraphsTable.findFirst({
    where: (paragraphs, { eq }) => eq(paragraphs.id, parentId),
    with: {
      children: true,
    },
  });
  if (!originParagraph) {
    throw new Error('Paragraph not found');
  }
  const paragraphId = uuidv4();
  const objectId = uuidv4();
  console.log({ paragraphId, objectId });

  await algoliaClient.saveObject({
    indexName: 'paragraphs',
    body: { ...newParagraph, id: paragraphId, objectID: objectId },
  });
  const result = await dbClient
    .insert(paragraphsTable)
    .values({
      id: paragraphId,
      ...newParagraph,
      order: originParagraph?.order,
      rollId: originParagraph?.rollId,
      searchId: objectId,
    })
    .returning({ id: paragraphsTable.id });

  return result;
};

export const createComment = async (newComment: CreateComment) => {
  const result = await dbClient.insert(commentsTable).values({
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
  const existingComment = await dbClient.query.commentsTable.findFirst({
    where: (comments, { eq }) => eq(comments.id, id),
  });
  if (!existingComment) {
    throw new Error('Comment not found');
  }
  const newMessages = [...(existingComment.messages || []), ...(messages || [])];
  const result = await dbClient
    .update(commentsTable)
    .set({
      messages: newMessages,
      resolved: resolved,
      updatedBy: updatedBy,
    })
    .where(eq(commentsTable.id, id));
  return result;
};

export const bulkCreateParagraphs = async ({
  sutraId,
  rollId,
  targetSutraId,
  targetRollId,
  data,
  createdBy,
}: {
  sutraId: string;
  rollId: string;
  targetSutraId?: string | null;
  targetRollId?: string | null;
  data: Array<{
    originSutra: string;
    targetSutra?: string;
    references: Array<{
      sutraName: string;
      content: string;
      order: string;
    }>;
  }>;
  createdBy: string;
}) => {
  // Fetch sutra information to get the correct languages
  const originSutra = await dbClient.query.sutrasTable.findFirst({
    where: (sutras, { eq }) => eq(sutras.id, sutraId),
  });

  if (!originSutra) {
    throw new Error(`Origin sutra with ID ${sutraId} not found`);
  }

  let targetSutra = null;
  if (targetSutraId) {
    targetSutra = await dbClient.query.sutrasTable.findFirst({
      where: (sutras, { eq }) => eq(sutras.id, targetSutraId),
    });

    if (!targetSutra) {
      throw new Error(`Target sutra with ID ${targetSutraId} not found`);
    }
  }
  // Prepare data for bulk operations
  const originParagraphs: CreateParagraph[] = [];
  const targetParagraphs: CreateParagraph[] = [];
  const allReferences: Array<{
    id: string;
    paragraphId: string;
    sutraName: string;
    content: string;
    order: string;
    createdBy: string;
    updatedBy: string;
  }> = [];
  const algoliaObjects: Array<{
    id: string;
    content: string;
    language: string;
    rollId: string;
    parentId?: string;
    objectID: string;
  }> = [];
  const results: Array<{
    originId: string;
    targetId: string | null;
    references: number;
  }> = [];

  // Pre-generate all IDs and prepare data structures
  for (let i = 0; i < data.length; i++) {
    const { originSutra: originSutraContent, targetSutra: targetSutraContent, references } = data[i];

    const originParagraphId = uuidv4();
    const originSearchId = uuidv4();

    // Prepare origin paragraph for DB
    originParagraphs.push({
      id: originParagraphId,
      content: originSutraContent,
      language: originSutra.language, // Use the origin sutra's language setting
      rollId,
      number: i,
      order: `${i}.0`,
      searchId: originSearchId,
      createdBy,
      updatedBy: createdBy,
    });

    // Prepare origin paragraph for Algolia
    algoliaObjects.push({
      id: originParagraphId,
      content: originSutraContent,
      language: originSutra.language, // Use the origin sutra's language setting
      rollId,
      objectID: originSearchId,
    });

    let targetParagraphId = null;
    let targetSearchId = null;

    // Create target paragraph only if targetSutra is provided and not empty, and target roll exists
    if (targetSutraContent && targetSutraContent.trim() && targetRollId && targetSutra) {
      targetParagraphId = uuidv4();
      targetSearchId = uuidv4();

      // Prepare target paragraph for DB - uses target roll ID, not origin roll ID
      targetParagraphs.push({
        id: targetParagraphId,
        content: targetSutraContent,
        language: targetSutra.language, // Use the target sutra's language setting
        rollId: targetRollId, // Use target roll ID, not origin roll ID
        parentId: originParagraphId,
        number: i,
        order: `${i}.0`,
        searchId: targetSearchId,
        createdBy,
        updatedBy: createdBy,
      });

      // Prepare target paragraph for Algolia
      algoliaObjects.push({
        id: targetParagraphId,
        content: targetSutraContent,
        language: targetSutra.language, // Use the target sutra's language setting
        rollId: targetRollId, // Use target roll ID, not origin roll ID
        parentId: originParagraphId,
        objectID: targetSearchId,
      });
    }

    // Prepare references for bulk insert
    if (references.length > 0) {
      const referencesToInsert = references.map((ref) => ({
        id: uuidv4(),
        paragraphId: originParagraphId,
        sutraName: ref.sutraName,
        content: ref.content,
        order: ref.order,
        createdBy,
        updatedBy: createdBy,
      }));

      allReferences.push(...referencesToInsert);
    }

    // Prepare result entry
    results.push({
      originId: originParagraphId,
      targetId: targetParagraphId,
      references: references.length,
    });
  }

  try {
    // Bulk insert to Algolia first (faster to rollback if DB fails)
    if (algoliaObjects.length > 0) {
      await algoliaClient.saveObjects({
        indexName: 'paragraphs',
        objects: algoliaObjects,
      });
    }

    // Bulk insert origin paragraphs to database
    const insertedOriginParagraphs = await dbClient
      .insert(paragraphsTable)
      .values(originParagraphs)
      .returning({ id: paragraphsTable.id });

    // Bulk insert target paragraphs to database if any
    let insertedTargetParagraphs: Array<{ id: string }> = [];
    if (targetParagraphs.length > 0) {
      insertedTargetParagraphs = await dbClient
        .insert(paragraphsTable)
        .values(targetParagraphs)
        .returning({ id: paragraphsTable.id });
    }

    // Bulk insert references if any
    if (allReferences.length > 0) {
      await dbClient.insert(referencesTable).values(allReferences);
    }

    // Map results with actual inserted data
    let targetIndex = 0;
    return results.map((result, index) => {
      let targetResult = null;
      if (result.targetId) {
        targetResult = insertedTargetParagraphs[targetIndex] || null;
        targetIndex++;
      }

      return {
        origin: insertedOriginParagraphs[index] || null,
        target: targetResult,
        references: result.references,
      };
    });
  } catch (error) {
    // If database operations fail, clean up Algolia objects
    console.error('Bulk paragraph creation failed:', error);

    if (algoliaObjects.length > 0) {
      try {
        const objectIDs = algoliaObjects.map((obj) => obj.objectID);
        await algoliaClient.deleteObjects({
          indexName: 'paragraphs',
          objectIDs,
        });
        console.log('Cleaned up Algolia objects after database failure');
      } catch (cleanupError) {
        console.error('Failed to cleanup Algolia objects:', cleanupError);
      }
    }

    throw error;
  }
};
