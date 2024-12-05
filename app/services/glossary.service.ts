import { sql as vercelSql } from '@vercel/postgres';
import { eq, inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/vercel-postgres';
import OpenAI from 'openai';
import 'dotenv/config';

import * as schema from '~/drizzle/schema';
import { glossariesTable, type CreateGlossary, type ReadGlossary, type UpdateGlossary } from '~/drizzle/tables';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const dbClient = drizzle(vercelSql, { schema });

export type Pagination = {
  page: number;
  limit?: number;
};

export const readGlossaries = async ({ page, limit = 10 }: Pagination): Promise<Omit<ReadGlossary, 'similarity'>[]> => {
  return dbClient.query.glossariesTable.findMany({
    limit,
    offset: (page - 1) * limit,
    orderBy: (glossaries, { desc }) => [desc(glossaries.glossary)],
    // orderBy: [asc(glossariesTable.updatedAt)],
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

export const updateGlossary = async (glossary: UpdateGlossary) => {
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

export const createGlossary = async (glossary: Omit<CreateGlossary, 'searchId'>) => {
  return dbClient.insert(glossariesTable).values({
    ...glossary,
  });
};
