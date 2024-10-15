import { sql as postgresql } from '@vercel/postgres';
import * as schema from '~/drizzle/schema';
import { drizzle } from 'drizzle-orm/vercel-postgres';
import 'dotenv/config';
import { paragraphsTable, type CreateParagraph } from '~/drizzle/schema';
import { eq } from 'drizzle-orm';

const dbClient = drizzle(postgresql, { schema });

export const readParagraphsByRollId = async (rollId: string) => {
  return dbClient.query.paragraphsTable.findMany({
    where: (paragraphs, { eq }) => eq(paragraphs.rollId, rollId),
    with: {
      paragraph: true,
      references: true,
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
