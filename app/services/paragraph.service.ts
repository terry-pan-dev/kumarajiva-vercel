import { sql as postgresql } from '@vercel/postgres';
import { and, eq, getTableColumns, inArray, isNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/vercel-postgres';
import { v4 as uuidv4 } from 'uuid';

import type { ReadHistory, CreateParagraph, ReadParagraph, ReadReference } from '~/drizzle/schema';

import { glossariesTable, paragraphsTable, rollsTable, sutrasTable } from '~/drizzle/schema';
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
        },
      },
      references: {
        orderBy: (references, { asc }) => [asc(references.order)],
      },
    },
    orderBy: (paragraphs, { asc }) => [asc(paragraphs.number), asc(paragraphs.order)],
  });

  const result = paragraphs.map((paragraph) => ({
    ...paragraph,
    origin: paragraph.content,
    target: paragraph.children?.content,
    histories: paragraph.children?.history || [],
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

export const searchAlgolia = async (searchTerm: string): Promise<SearchResultListProps['results']> => {
  const numberOfHits = 5;
  const paragraphsIndexExist = await algoliaClient.indexExists({ indexName: 'paragraphs' });
  const glossariesIndexExist = await algoliaClient.indexExists({ indexName: 'glossaries' });
  if (!paragraphsIndexExist && !glossariesIndexExist) {
    return [];
  }
  const { results } = await algoliaClient.search<ReadParagraph>({
    requests: [
      {
        indexName: 'paragraphs',
        query: searchTerm,
        hitsPerPage: numberOfHits,
      },
      {
        indexName: 'glossaries',
        query: searchTerm,
        hitsPerPage: numberOfHits,
      },
    ],
  });

  let ids: string[] = [];
  let searchResults: SearchResultListProps['results'] = [];
  if (results.length) {
    for (const result of results) {
      if ('hits' in result) {
        if (result.index === 'paragraphs') {
          ids = result.hits.map((hit) => hit.id);
          const paragraphs = await queryParagraphs(ids, numberOfHits);
          searchResults.push(...paragraphs?.map((p) => ({ ...p, type: 'Paragraph' as const })));
        }
        if (result.index === 'glossaries') {
          ids = result.hits.map((hit) => hit.id);
          const glossaries = await dbClient
            .select()
            .from(glossariesTable)
            .where(inArray(glossariesTable.id, ids))
            .limit(numberOfHits);
          searchResults.push(...glossaries?.map((g) => ({ ...g, type: 'Glossary' as const })));
        }
      }
    }
  }
  return searchResults;
};

export const upsertParagraph = async (paragraph: CreateParagraph) => {
  const { parentId, rollId } = paragraph;
  if (!rollId) {
    throw new Error('Roll id is required');
  }
  const roll = await dbClient.query.rollsTable.findFirst({
    where: (rolls, { eq }) => eq(rolls.id, rollId),
    with: {
      children: true,
    },
  });
  if (!roll?.children) {
    throw new Error('Roll has no children');
  }
  if (!parentId) {
    throw new Error('Parent id is required');
  }
  const originParagraph = await dbClient.query.paragraphsTable.findFirst({
    where: (paragraphs, { eq }) => eq(paragraphs.id, parentId),
    with: {
      children: true,
    },
  });

  if (originParagraph?.children) {
    if (originParagraph.children.searchId) {
      await algoliaClient.partialUpdateObject({
        indexName: 'paragraphs',
        objectID: originParagraph.children.searchId,
        attributesToUpdate: {
          content: paragraph.content,
        },
      });
    }

    const result = await dbClient
      .update(paragraphsTable)
      .set({
        ...paragraph,
        rollId: roll.children.id,
      })
      .where(eq(paragraphsTable.id, originParagraph.children.id));

    return result;
  }

  const paragraphId = uuidv4();
  console.log({ paragraphId });
  // TODO: remove this after testing
  const savedSearchResult =
    paragraph.rollId !== 'decb3798-76b5-424a-b83a-b9fdde6a7f53'
      ? await algoliaClient.saveObject({
          indexName: 'paragraphs',
          body: { ...paragraph, id: paragraphId },
        })
      : { objectID: null };
  const result = await dbClient
    .insert(paragraphsTable)
    .values({
      id: paragraphId,
      ...paragraph,
      order: originParagraph?.order,
      rollId: roll?.children.id,
      searchId: savedSearchResult.objectID,
    })
    .returning({ id: paragraphsTable.id });

  return result;
};
