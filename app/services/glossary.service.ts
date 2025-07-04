import { sql as vercelSql } from '@vercel/postgres';
import { eq, inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/vercel-postgres';
import OpenAI from 'openai';
import 'dotenv/config';

import * as schema from '~/drizzle/schema';
import { glossariesTable, type CreateGlossary, type ReadGlossary, type UpdateGlossary } from '~/drizzle/tables';

import type { BulkGlossaryUploadData } from '../validations/glossary-upload.validation';

import algoliaClient from '../providers/algolia';

// Type for individual upload result item from validation schema
type UploadResultItem = BulkGlossaryUploadData['uploadResults'][0];

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

// Transform upload data to glossary format with validation and ID grouping
const transformUploadDataToGlossaries = (
  uploadData: UploadResultItem[],
  userId: string,
): { glossaries: Omit<CreateGlossary, 'searchId'>[]; errors: string[] } => {
  const errors: string[] = [];

  // Group upload data by ID (UUID)
  const groupedByID = uploadData.reduce(
    (acc, item) => {
      if (!acc[item.id]) {
        acc[item.id] = [];
      }
      acc[item.id].push(item);
      return acc;
    },
    {} as Record<string, UploadResultItem[]>,
  );

  // Transform each group into a single glossary with multiple translations
  const glossaries = Object.entries(groupedByID)
    .map(([id, items]) => {
      try {
        return transformGroupedItemsToGlossary(items, userId);
      } catch (error) {
        errors.push(`Failed to transform grouped data for ID ${id}: ${error}`);
        return null;
      }
    })
    .filter((glossary): glossary is Omit<CreateGlossary, 'searchId'> => glossary !== null);

  return { glossaries, errors };
};

// Transform grouped items (same ID) into a single glossary object
const transformGroupedItemsToGlossary = (
  items: UploadResultItem[],
  userId: string,
): Omit<CreateGlossary, 'searchId'> => {
  if (items.length === 0) {
    throw new Error('No items to transform');
  }

  // Use the first item as the base for common fields
  const baseItem = items[0];
  const translations = [];

  // Collect all unique translations from all items with the same ID
  for (const item of items) {
    if (item.english) {
      translations.push({
        glossary: item.english,
        language: 'english' as const,
        sutraName: item.sutraName || '',
        volume: item.volume || '',
        originSutraText: item.originSutraText || null,
        targetSutraText: item.targetSutraText || null,
        author: item.author || null,
        updatedBy: userId,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  return {
    id: baseItem.id,
    glossary: baseItem.glossary,
    phonetic: baseItem.phonetic || null,
    author: baseItem.author || null,
    cbetaFrequency: baseItem.cbetaFrequency || null,
    discussion: baseItem.discussion || null,
    subscribers: 0,
    translations: translations.length > 0 ? translations : null,
    createdBy: userId,
    updatedBy: userId,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };
};

// Prepare glossary data for Algolia indexing
const prepareAlgoliaObjects = (glossaries: Omit<CreateGlossary, 'searchId'>[]): any[] => {
  const algoliaObjects = glossaries.map((glossary) => ({
    id: glossary.id,
    phonetic: glossary.phonetic,
    glossary: glossary.glossary,
    translations:
      glossary.translations?.map((translation) => ({
        glossary: translation.glossary,
        language: translation.language,
        phonetic: translation.phonetic || undefined,
      })) || [],
  }));

  console.log(`Prepared ${algoliaObjects.length} objects for Algolia indexing`);
  console.log('Sample Algolia object:', algoliaObjects[0]);

  return algoliaObjects;
};

// Index glossaries in Algolia with batch processing
const indexGlossariesInAlgolia = async (
  algoliaObjects: any[],
  batchSize: number = 1000,
): Promise<{ allObjectIDs: string[]; errors: string[] }> => {
  console.log('Starting Algolia indexing...');

  const errors: string[] = [];
  const allObjectIDs: string[] = [];

  // Create batches for Algolia indexing
  const batches = [];
  for (let i = 0; i < algoliaObjects.length; i += batchSize) {
    batches.push(algoliaObjects.slice(i, i + batchSize));
  }

  console.log(`Created ${batches.length} batches for Algolia indexing (batch size: ${batchSize})`);
  console.log(
    'Batch sizes:',
    batches.map((batch) => batch.length),
  );

  // Process each batch
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`Processing Algolia batch ${i + 1}/${batches.length} with ${batch.length} items`);

    try {
      const algoliaResponse = await algoliaClient.saveObjects({
        indexName: 'glossaries',
        objects: batch,
      });

      // Collect object IDs from this batch
      allObjectIDs.push(...algoliaResponse[0].objectIDs);
      console.log(`Successfully indexed Algolia batch ${i + 1}, total indexed: ${allObjectIDs.length}`);
    } catch (batchError) {
      const errorMessage = `Failed to index Algolia batch ${i + 1}: ${batchError}`;
      errors.push(errorMessage);
      console.error(errorMessage);

      // Add placeholder IDs for failed batch to maintain alignment
      for (let j = 0; j < batch.length; j++) {
        allObjectIDs.push(`failed-${Date.now()}-${i}-${j}`);
      }
    }
  }

  console.log(`Algolia indexing completed. Indexed: ${allObjectIDs.length}, Errors: ${errors.length}`);

  return { allObjectIDs, errors };
};

// Add search IDs to glossaries
const addSearchIdsToGlossaries = (
  glossaries: Omit<CreateGlossary, 'searchId'>[],
  allObjectIDs: string[],
): CreateGlossary[] => {
  const glossariesWithSearchId = glossaries.map((glossary, index) => ({
    ...glossary,
    searchId: allObjectIDs[index],
  }));

  console.log(`Added search IDs to ${glossariesWithSearchId.length} glossaries`);
  console.log('Sample glossary with search ID:', {
    id: glossariesWithSearchId[0]?.id,
    searchId: glossariesWithSearchId[0]?.searchId,
  });

  return glossariesWithSearchId;
};

// Insert glossaries into database in batches
const insertGlossariesInBatches = async (
  glossaries: CreateGlossary[],
  batchSize: number = 1000,
): Promise<{ processed: number; errors: string[] }> => {
  const errors: string[] = [];
  let processed = 0;

  // Create batches
  const batches = [];
  for (let i = 0; i < glossaries.length; i += batchSize) {
    batches.push(glossaries.slice(i, i + batchSize));
  }

  console.log(`Created ${batches.length} batches for database insertion (batch size: ${batchSize})`);
  console.log(
    'Batch sizes:',
    batches.map((batch) => batch.length),
  );

  // Process each batch
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`Processing batch ${i + 1}/${batches.length} with ${batch.length} items`);

    try {
      await dbClient.insert(glossariesTable).values(batch).onConflictDoNothing(); // Skip duplicates based on unique glossary constraint

      processed += batch.length;
      console.log(`Successfully inserted batch ${i + 1}, total processed: ${processed}`);
    } catch (batchError) {
      const errorMessage = `Failed to insert batch ${i + 1}: ${batchError}`;
      errors.push(errorMessage);
      console.error(errorMessage);
    }
  }

  console.log(`Database insertion completed. Processed: ${processed}, Errors: ${errors.length}`);

  return { processed, errors };
};

// Bulk create glossaries with Algolia indexing
export const bulkCreateGlossaries = async (
  uploadData: UploadResultItem[],
  userId: string,
): Promise<{ success: boolean; processed: number; errors: string[] }> => {
  console.log(`Starting bulk glossary creation for ${uploadData.length} items, user: ${userId}`);

  try {
    // Step 1: Transform upload data to glossary format
    const { glossaries, errors: transformErrors } = transformUploadDataToGlossaries(uploadData, userId);

    if (glossaries.length === 0) {
      console.log('No valid glossary data to process');
      return { success: false, processed: 0, errors: ['No valid glossary data to process', ...transformErrors] };
    }

    // Step 2: Prepare data for Algolia indexing
    const algoliaObjects = prepareAlgoliaObjects(glossaries);

    // Step 3: Index in Algolia first
    const { allObjectIDs, errors: algoliaErrors } = await indexGlossariesInAlgolia(algoliaObjects);

    // Step 4: Add search IDs to glossaries
    const glossariesWithSearchId = addSearchIdsToGlossaries(glossaries, allObjectIDs);

    // Step 5: Insert into database in batches
    const { processed, errors: insertErrors } = await insertGlossariesInBatches(glossariesWithSearchId);

    const allErrors = [...transformErrors, ...algoliaErrors, ...insertErrors];
    const success = allErrors.length === 0;

    console.log(
      `Bulk glossary creation completed. Success: ${success}, Processed: ${processed}, Total errors: ${allErrors.length}`,
    );

    return {
      success,
      processed,
      errors: allErrors,
    };
  } catch (error) {
    const errorMessage = `Bulk operation failed: ${error}`;
    console.error('Bulk glossary creation failed:', error);
    return {
      success: false,
      processed: 0,
      errors: [errorMessage],
    };
  }
};

// Enhanced remote search with pagination and filtering
export const searchGlossariesRemote = async ({
  query,
  page = 1,
  limit = 10,
  filters = {},
}: {
  query: string;
  page?: number;
  limit?: number;
  filters?: {
    language?: string;
    author?: string;
    sutraName?: string;
  };
}): Promise<{
  glossaries: ReadGlossary[];
  totalHits: number;
  totalPages: number;
  currentPage: number;
}> => {
  const indexExist = await algoliaClient.indexExists({ indexName: 'glossaries' });
  if (!indexExist) {
    return {
      glossaries: [],
      totalHits: 0,
      totalPages: 0,
      currentPage: page,
    };
  }

  // Build search filters
  const searchFilters = [];
  if (filters.language) {
    searchFilters.push(`translations.language:${filters.language}`);
  }
  if (filters.author) {
    searchFilters.push(`author:${filters.author}`);
  }
  if (filters.sutraName) {
    searchFilters.push(`translations.sutraName:${filters.sutraName}`);
  }

  try {
    const searchResponse = await algoliaClient.search<ReadGlossary>({
      requests: [
        {
          indexName: 'glossaries',
          query,
          hitsPerPage: limit,
          page: page - 1, // Algolia uses 0-based pagination
          filters: searchFilters.join(' AND '),
          attributesToRetrieve: ['*'],
          highlightPreTag: '<mark>',
          highlightPostTag: '</mark>',
        },
      ],
    });

    const result = searchResponse.results[0];
    if ('hits' in result) {
      const glossaries = result.hits.map((hit) => {
        const { _highlightResult, ...glossary } = hit;
        return glossary;
      });

      return {
        glossaries,
        totalHits: result.nbHits || 0,
        totalPages: result.nbPages || 0,
        currentPage: page,
      };
    }

    return {
      glossaries: [],
      totalHits: 0,
      totalPages: 0,
      currentPage: page,
    };
  } catch (error) {
    console.error('Remote search failed:', error);
    return {
      glossaries: [],
      totalHits: 0,
      totalPages: 0,
      currentPage: page,
    };
  }
};

// Get glossary suggestions for autocomplete
export const getGlossarySuggestions = async (query: string, limit: number = 10): Promise<string[]> => {
  const indexExist = await algoliaClient.indexExists({ indexName: 'glossaries' });
  if (!indexExist || !query.trim()) {
    return [];
  }

  try {
    const searchResponse = await algoliaClient.search<ReadGlossary>({
      requests: [
        {
          indexName: 'glossaries',
          query,
          hitsPerPage: limit,
          attributesToRetrieve: ['glossary'],
          removeStopWords: true,
        },
      ],
    });

    const result = searchResponse.results[0];
    if ('hits' in result) {
      return result.hits
        .map((hit) => hit.glossary)
        .filter((glossary): glossary is string => Boolean(glossary))
        .slice(0, limit);
    }

    return [];
  } catch (error) {
    console.error('Suggestion search failed:', error);
    return [];
  }
};
