import { sql as postgresql } from '@vercel/postgres';
import * as schema from '~/drizzle/schema';
import { drizzle } from 'drizzle-orm/vercel-postgres';
import 'dotenv/config';
import { paragraphsTable, type CreateParagraph, type ReadReference } from '~/drizzle/schema';
import { and, eq, isNull } from 'drizzle-orm';

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
    return dbClient
      .update(paragraphsTable)
      .set({
        ...paragraph,
        rollId: roll.children.id,
      })
      .where(eq(paragraphsTable.id, originParagraph.children.id));
  }
  return dbClient.insert(paragraphsTable).values({
    ...paragraph,
    order: originParagraph?.order,
    rollId: roll?.children.id,
  });
};
