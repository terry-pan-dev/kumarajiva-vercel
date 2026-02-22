import type { SearchQuery } from '@algolia/client-search';

import { eq, getTableColumns, inArray } from 'drizzle-orm';
import 'dotenv/config';
import { alias } from 'drizzle-orm/pg-core';

import type { CreateParagraph, ReadParagraph, ReadGlossary } from '~/drizzle/schema';

import { type SearchResultListProps } from '~/components/SideBarMenu';
import { glossariesTable, paragraphsTable, rollsTable, sutrasTable } from '~/drizzle/schema';
import { getDb } from '~/lib/db.server';
import algoliaClient from '~/providers/algolia';

const dbClient = getDb();

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

export const updateParagraphToAlgolia = async (searchId: string, dataToUpdate: Partial<CreateParagraph>) => {
  await algoliaClient.partialUpdateObject({
    indexName: 'paragraphs',
    objectID: searchId,
    attributesToUpdate: dataToUpdate,
  });
};

export const saveParagraphToAlgolia = async (paragraph: CreateParagraph): Promise<void> => {
  const { id, ...rest } = paragraph;
  await algoliaClient.saveObject({
    indexName: 'paragraphs',
    body: { ...rest, id: id, objectID: paragraph.searchId },
  });
};
