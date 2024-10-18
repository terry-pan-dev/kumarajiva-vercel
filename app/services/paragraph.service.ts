import { sql as postgresql } from '@vercel/postgres';
import * as schema from '~/drizzle/schema';
import { drizzle } from 'drizzle-orm/vercel-postgres';
import 'dotenv/config';
import { paragraphsTable, type CreateParagraph } from '~/drizzle/schema';
import { and, eq, isNull } from 'drizzle-orm';

const dbClient = drizzle(postgresql, { schema });

export const readParagraphsByRollId = async (rollId: string) => {
  return dbClient.query.paragraphsTable.findMany({
    where: (paragraphs, { eq }) => eq(paragraphs.rollId, rollId),
    orderBy: (paragraphs, { asc }) => [asc(paragraphs.order)],
    with: {
      paragraph: true,
      references: true,
    },
  });
};

export const readParagraphsAndReferencesByRollId = async (rollId: string) => {
  return dbClient.query.paragraphsTable.findMany({
    where: (paragraphs, { eq }) => and(eq(paragraphs.rollId, rollId), isNull(paragraphs.parentId)),
    orderBy: (paragraphs, { asc }) => [asc(paragraphs.order)],
    with: {
      paragraph: true,
      references: {
        orderBy: (references, { asc }) => [asc(references.order)],
      },
    },
  });
};

export const upsertParagraph = async (paragraph: CreateParagraph) => {
  const prev = await dbClient.query.paragraphsTable.findFirst({
    where: (paragraphs, { eq }) => eq(paragraphs.parentId, paragraph.parentId || ''),
  });
  if (prev) {
    return dbClient.update(paragraphsTable).set(paragraph).where(eq(paragraphsTable.id, prev.id));
  }
  return dbClient.insert(paragraphsTable).values(paragraph);
};
