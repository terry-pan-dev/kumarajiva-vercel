import { sql as postgresql } from '@vercel/postgres';
import * as schema from '~/drizzle/schema';
import { drizzle } from 'drizzle-orm/vercel-postgres';
import 'dotenv/config';
import { paragraphsTable, type CreateParagraph, type ReadParagraph, type ReadReference } from '~/drizzle/schema';
import { aliasedTable, and, asc, eq, isNull } from 'drizzle-orm';

const dbClient = drizzle(postgresql, { schema });

export interface IParagraph {
  id: string;
  origin: string;
  rollId: string;
  target: string | null;
  references: ReadReference[];
}

export const readParagraphsByRollId = async (rollId: string): Promise<IParagraph[]> => {
  const source = aliasedTable(paragraphsTable, 'source');
  const target = aliasedTable(paragraphsTable, 'target');
  const paragraphs = (await dbClient
    .select()
    .from(source)
    .leftJoin(target, eq(source.id, target.parentId))
    .orderBy(asc(source.order))
    .where(and(isNull(source.parentId), eq(source.rollId, rollId)))) as unknown as {
    source: ReadParagraph;
    target: ReadParagraph;
  }[];

  const references = await dbClient.query.paragraphsTable.findMany({
    where: (paragraphs, { eq, and }) => and(eq(paragraphs.rollId, rollId), isNull(paragraphs.parentId)),
    with: {
      references: true,
    },
  });

  const result = paragraphs.map((paragraph: { source: ReadParagraph; target: ReadParagraph }) => ({
    id: paragraph.source.id,
    rollId: paragraph.source.rollId,
    origin: paragraph.source.content,
    target: paragraph.target ? paragraph.target.content : null,
    references: references.find((r) => r.id === paragraph.source.id)?.references || [],
  }));

  return result;
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
