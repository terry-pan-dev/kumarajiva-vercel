import { sql as vercelSql } from '@vercel/postgres';
import * as schema from '~/drizzle/schema';
import { glossariesTable, type CreateGlossary, type ReadGlossary } from '~/drizzle/tables';
import { drizzle } from 'drizzle-orm/vercel-postgres';
import 'dotenv/config';
import { cosineDistance, desc, gt, sql } from 'drizzle-orm';
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const dbClient = drizzle(vercelSql, { schema });

export type Pagination = {
  skip: number;
  take: number;
};

export const readGlossaries = async ({ skip, take }: Pagination): Promise<ReadGlossary[]> => {
  return dbClient.query.glossariesTable.findMany({
    limit: take,
    offset: skip,
  });
};

const generateEmbedding = async (text: string) => {
  const embedding = await client.embeddings.create({
    input: text,
    model: 'text-embedding-3-small',
    encoding_format: 'float',
    dimensions: 1536,
  });

  return embedding.data[0].embedding;
};

export const searchGlossaries = async (searchTerm: string): Promise<ReadGlossary[]> => {
  const embedding = await generateEmbedding(searchTerm);
  const similarity = sql<number>`1 - (${cosineDistance(glossariesTable.embedding, embedding)})`;
  return dbClient.select().from(glossariesTable).where(gt(similarity, 0.5)).orderBy(desc(similarity)).limit(5);
};

export const createGlossary = async (glossary: Omit<CreateGlossary, 'searchId' | 'updatedBy' | 'createdBy'>) => {
  const embedding = await generateEmbedding(`${glossary.origin?.toLowerCase()} : ${glossary.target?.toLowerCase()}`);
  if (!embedding) {
    throw new Error('Failed to create embedding');
  }

  return dbClient.insert(glossariesTable).values({
    ...glossary,
    embedding,
    searchId: '5eefc822-fadf-4e8d-892b-0a3badef4282',
    updatedBy: '5eefc822-fadf-4e8d-892b-0a3badef4282',
    createdBy: '5eefc822-fadf-4e8d-892b-0a3badef4282',
  });
};
