import { sql as vercelSql } from '@vercel/postgres';
import { eq, inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/vercel-postgres';
import OpenAI from 'openai';
import 'dotenv/config';

import * as schema from '~/drizzle/schema';
import { glossariesTable, type CreateGlossary, type ReadGlossary, type UpdateGlossary } from '~/drizzle/tables';

import algoliaClient from '../providers/algolia';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const dbClient = drizzle(vercelSql, { schema });

export type Pagination = {
  page: number;
  limit?: number;
};

export const readGlossaries = async ({
  page,
  limit = 10,
}: Pagination): Promise<{
  glossaries: Omit<ReadGlossary, 'similarity'>[];
  totalPages: number;
}> => {
  const [glossaries, totalCount] = await Promise.all([
    dbClient.query.glossariesTable.findMany({
      limit,
      offset: (page - 1) * limit,
      orderBy: (glossaries, { desc }) => [
        desc(glossaries.updatedAt),
        desc(glossaries.createdAt),
        desc(glossaries.glossary),
      ],
    }),
    dbClient
      .select({ count: sql<number>`count(*)` })
      .from(glossariesTable)
      .then((result) => result[0].count),
  ]);

  return {
    glossaries,
    totalPages: Math.ceil(totalCount / limit),
  };
};

export const getGlossariesByGivenGlossaries = async (glossaries: string[]): Promise<ReadGlossary[]> => {
  return dbClient.query.glossariesTable.findMany({
    where: inArray(glossariesTable.glossary, glossaries),
  });
};

export const readSutraNames = async () => {
  const result = await dbClient.select({ translations: glossariesTable.translations }).from(glossariesTable);

  const sutraNames = result.map((r) => r.translations?.filter((t) => t.sutraName).map((t) => t.sutraName));
  return Array.from(new Set(sutraNames.flat()));
};

export const readGlossariesByIds = async (ids: string[]) => {
  return dbClient.query.glossariesTable.findMany({
    where: inArray(glossariesTable.id, ids),
    orderBy: (glossaries, { desc }) => [desc(glossaries.glossary)],
  });
};

type ReturnType<T> = T extends string ? number[] : T extends string[] ? number[][] : never;
export const generateEmbedding = async <T extends string | string[]>(text: T): Promise<ReturnType<T>> => {
  if (typeof text === 'string') {
    const embedding = await client.embeddings.create({
      input: text,
      model: 'text-embedding-3-small',
      encoding_format: 'float',
      dimensions: 1536,
    });

    return embedding.data[0].embedding as ReturnType<T>;
  }
  const embeddings = await client.embeddings.create({
    input: text,
    model: 'text-embedding-3-small',
    encoding_format: 'float',
    dimensions: 1536,
  });
  return embeddings.data.map((embedding) => embedding.embedding) as ReturnType<T>;
};

export const updateGlossarySubscribers = async (glossary: UpdateGlossary) => {
  if (!glossary.id) {
    throw new Error('Glossary id is required');
  }
  if (glossary.subscribers) {
    const newSubscribers =
      glossary.subscribers > 0 ? sql`${glossariesTable.subscribers} + 1` : sql`${glossariesTable.subscribers} - 1`;
    return dbClient
      .update(glossariesTable)
      .set({ subscribers: newSubscribers })
      .where(eq(glossariesTable.id, glossary.id));
  }
  return dbClient.update(glossariesTable).set(glossary).where(eq(glossariesTable.id, glossary.id));
};

export const updateGlossaryTranslations = async ({
  id,
  phonetic,
  author,
  cbetaFrequency,
  translations = [],
  discussion,
  updatedBy,
  isNewInsert = false,
}: {
  id: string;
  phonetic: string | null;
  author: string | null;
  cbetaFrequency: string | null;
  discussion: string | null;
  translations: UpdateGlossary['translations'];
  updatedBy: string | null;
  isNewInsert?: boolean;
}) => {
  const glossary = await dbClient.query.glossariesTable.findFirst({ where: eq(glossariesTable.id, id) });
  if (!glossary) {
    throw new Error('Glossary not found');
  }
  const { searchId } = glossary;

  let newTranslations = [...(translations ?? [])];
  if (isNewInsert) {
    newTranslations = [...(glossary.translations ?? []), ...(translations ?? [])];
  }
  const translationsToSearch = newTranslations?.map((translation) => ({
    glossary: translation.glossary,
    language: translation.language,
    phonetic: translation.phonetic ?? undefined,
  }));

  if (searchId) {
    await algoliaClient.partialUpdateObject({
      indexName: 'glossaries',
      objectID: searchId,
      attributesToUpdate: {
        translations: translationsToSearch,
        phonetic: phonetic ? phonetic.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : undefined,
      },
    });
  }

  const toUpdate = {
    translations: newTranslations,
    phonetic: phonetic ?? undefined,
    author: author ?? undefined,
    cbetaFrequency: cbetaFrequency ?? undefined,
    updatedBy: updatedBy ?? undefined,
    discussion: discussion ?? undefined,
  };

  console.log(toUpdate);

  return await dbClient
    .update(glossariesTable)
    .set({
      ...toUpdate,
    })
    .where(eq(glossariesTable.id, id));
};

export const createGlossary = async (glossary: Omit<CreateGlossary, 'searchId'>) => {
  return dbClient.insert(glossariesTable).values({
    ...glossary,
  });
};

export const createGlossaryAndIndexInAlgolia = async (glossary: Omit<CreateGlossary, 'searchId'>) => {
  const response = await algoliaClient.saveObject({
    indexName: 'glossaries',
    body: {
      id: glossary.id,
      phonetic: glossary.phonetic,
      glossary: glossary.glossary,
      translations: glossary.translations?.map((translation) => ({
        glossary: translation.glossary,
        language: translation.language,
      })),
    },
  });
  const savedGlossary = await dbClient.insert(glossariesTable).values({
    ...glossary,
    searchId: response.objectID,
  });
  return savedGlossary;
};

export const searchGlossaries = async (tokens: string[]) => {
  const glossaries: ReadGlossary[] = [];
  const batchSize = 50;
  const batches = [];
  for (let i = 0; i < tokens.length; i += batchSize) {
    batches.push(tokens.slice(i, i + batchSize));
  }
  const multiSearchQueryBatches = batches.map((batch) => {
    return batch?.map((token) => ({
      indexName: 'glossaries',
      query: token,
      hitsPerPage: 1,
      removeStopWords: true,
    }));
  });
  const indexExist = await algoliaClient.indexExists({ indexName: 'glossaries' });
  if (!indexExist) {
    return [];
  }
  for await (const batch of multiSearchQueryBatches) {
    const { results } = await algoliaClient.search<ReadGlossary>({
      requests: batch,
    });
    if (results.length) {
      results.forEach((result) => {
        if ('hits' in result) {
          result.hits.forEach((hit) => {
            const { _highlightResult, ...rest } = hit;
            glossaries.push(rest);
          });
        }
      });
    }
    console.log('glossary_searcher result', results?.length);
  }
  return glossaries.reduce(
    (acc, glossary) => {
      if (glossary.glossary) {
        acc[glossary.glossary] = glossary.translations?.map((t) => t.glossary) ?? [];
      }
      return acc;
    },
    {} as Record<string, string[]>,
  );
};

export const getAllGlossaries = async (): Promise<ReadGlossary[]> => {
  const glossaries = await dbClient.query.glossariesTable.findMany({
    orderBy: (glossaries, { desc }) => [desc(glossaries.glossary)],
  });
  return glossaries;
};

export const deleteGlossariesByUserId = async (userId: string) => {
  const glossaries = await dbClient.query.glossariesTable.findMany({
    where: eq(glossariesTable.createdBy, userId),
  });

  const glossaryIds = glossaries.map((glossary) => glossary.id);
  await algoliaClient.deleteObjects({
    indexName: 'glossaries',
    objectIDs: glossaryIds,
  });
  return await dbClient.delete(glossariesTable).where(eq(glossariesTable.createdBy, userId));
};
