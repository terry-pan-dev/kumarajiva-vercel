import { sql as postgresql } from '@vercel/postgres';
import * as schema from '~/drizzle/schema';
import { drizzle } from 'drizzle-orm/vercel-postgres';
import 'dotenv/config';
import {
  glossariesTable,
  paragraphsTable,
  rollsTable,
  sutrasTable,
  type CreateParagraph,
  type ReadParagraph,
  type ReadReference,
} from '~/drizzle/schema';
import { and, eq, getTableColumns, inArray, isNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { type SearchResultListProps } from '../components/SideBarMenu';
import algoliaClient from '../providers/algolia';

const dbClient = drizzle(postgresql, { schema });

export interface IParagraph {
  id: string;
  origin: string;
  rollId: string;
  target: string | null;
  references: ReadReference[];
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
      children: true,
      references: true,
    },
  });

  const result = paragraphs.map((paragraph) => ({
    ...paragraph,
    origin: paragraph.content,
    target: paragraph.children?.content,
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

const queryParagraphs = (ids: string[]) => {
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
    .limit(5);
};

export const searchAlgolia = async (searchTerm: string): Promise<SearchResultListProps['results']> => {
  const { results } = await algoliaClient.search<ReadParagraph>({
    requests: [
      {
        indexName: 'paragraphs',
        query: searchTerm,
      },
      {
        indexName: 'glossaries',
        query: searchTerm,
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
          const paragraphs = await queryParagraphs(ids);
          searchResults.push(...paragraphs?.map((p) => ({ ...p, type: 'Paragraph' as const })));
        }
        if (result.index === 'glossaries') {
          ids = result.hits.map((hit) => hit.id);
          const glossaries = await dbClient
            .select()
            .from(glossariesTable)
            .where(inArray(glossariesTable.id, ids))
            .limit(5);
          searchResults.push(...glossaries?.map((g) => ({ ...g, type: 'Glossary' as const })));
        }
      }
    }
  }
  return searchResults;
};

export const upsertParagraph = async (paragraph: CreateParagraph) => {
  const { parentId, rollId } = paragraph;
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
    const result = await dbClient
      .update(paragraphsTable)
      .set({
        ...paragraph,
        rollId: roll.children.id,
      })
      .where(eq(paragraphsTable.id, originParagraph.children.id));

    return result;
  }
  const result = await dbClient
    .insert(paragraphsTable)
    .values({
      ...paragraph,
      order: originParagraph?.order,
      rollId: roll?.children.id,
    })
    .returning({ id: paragraphsTable.id });

  await algoliaClient.saveObjects({
    indexName: 'paragraphs',
    objects: [{ ...paragraph, id: result[0].id }],
  });

  return result;
};
