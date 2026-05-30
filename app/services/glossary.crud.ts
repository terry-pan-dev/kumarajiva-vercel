import { eq, inArray, sql } from 'drizzle-orm';

import { glossariesTable, type CreateGlossary, type ReadGlossary, type UpdateGlossary } from '~/drizzle/tables';
import { getDb } from '~/lib/db.server';

const db = getDb();

type OrderByColumn = 'updatedAt' | 'createdAt' | 'glossary' | 'subscribers';
type SortDirection = 'asc' | 'desc';

export type GlossaryPage = {
  glossaries: ReadGlossary[];
  totalPages: number;
  totalCount: number;
};

export const DbGlossaries = {
  // --------------------------------------------------
  // READ
  // --------------------------------------------------

  findById: async (id: string): Promise<ReadGlossary | undefined> => {
    return db.query.glossariesTable.findFirst({
      where: eq(glossariesTable.id, id),
    });
  },

  findByIds: async (ids: string[]): Promise<ReadGlossary[]> => {
    if (!ids.length) return [];
    return db.query.glossariesTable.findMany({
      where: inArray(glossariesTable.id, ids),
    });
  },

  findByTerms: async (terms: string[]): Promise<ReadGlossary[]> => {
    if (!terms.length) return [];
    return db.query.glossariesTable.findMany({
      where: inArray(glossariesTable.glossary, terms),
    });
  },

  findPage: async ({
    page,
    limit = 10,
    orderBy = 'updatedAt',
    direction = 'desc',
  }: {
    page: number;
    limit?: number;
    orderBy?: OrderByColumn;
    direction?: SortDirection;
  }): Promise<GlossaryPage> => {
    const [glossaries, countResult] = await Promise.all([
      db.query.glossariesTable.findMany({
        limit,
        offset: (page - 1) * limit,
        orderBy: (t, { asc, desc }) => {
          const col = t[orderBy];
          return [direction === 'asc' ? asc(col) : desc(col)];
        },
      }),
      db.select({ count: sql<number>`count(*)` }).from(glossariesTable),
    ]);

    const totalCount = Number(countResult[0].count);
    return {
      glossaries,
      totalCount,
      totalPages: Math.ceil(totalCount / limit),
    };
  },

  // --------------------------------------------------
  // CREATE
  // --------------------------------------------------

  create: async (glossary: CreateGlossary): Promise<ReadGlossary[]> => {
    return db.insert(glossariesTable).values(glossary).returning();
  },

  // --------------------------------------------------
  // UPDATE
  // --------------------------------------------------

  updateById: async (id: string, data: UpdateGlossary): Promise<ReadGlossary[]> => {
    return db.update(glossariesTable).set(data).where(eq(glossariesTable.id, id)).returning();
  },

  // --------------------------------------------------
  // UPSERT (batch)
  // --------------------------------------------------

  // Upsert rows that carry an explicit id — conflicts resolved on primary key.
  upsertManyById: async (glossaries: CreateGlossary[]): Promise<ReadGlossary[]> => {
    if (!glossaries.length) return [];
    return db
      .insert(glossariesTable)
      .values(glossaries)
      .onConflictDoUpdate({
        target: glossariesTable.id,
        set: {
          glossary: sql`excluded.glossary`,
          phonetic: sql`excluded.phonetic`,
          subscribers: sql`excluded.subscribers`,
          author: sql`excluded.author`,
          cbetaFrequency: sql`excluded.cbeta_frequency`,
          translations: sql`excluded.translations`,
          discussion: sql`excluded.discussion`,
          searchId: sql`excluded.search_id`,
          updatedAt: sql`excluded.updated_at`,
          updatedBy: sql`excluded.updated_by`,
        },
      })
      .returning();
  },

  // Upsert rows identified by their glossary term — conflicts resolved on the unique term index.
  upsertManyByTerm: async (glossaries: CreateGlossary[]): Promise<ReadGlossary[]> => {
    if (!glossaries.length) return [];
    return db
      .insert(glossariesTable)
      .values(glossaries)
      .onConflictDoUpdate({
        target: glossariesTable.glossary,
        set: {
          phonetic: sql`excluded.phonetic`,
          subscribers: sql`excluded.subscribers`,
          author: sql`excluded.author`,
          cbetaFrequency: sql`excluded.cbeta_frequency`,
          translations: sql`excluded.translations`,
          discussion: sql`excluded.discussion`,
          searchId: sql`excluded.search_id`,
          updatedAt: sql`excluded.updated_at`,
          updatedBy: sql`excluded.updated_by`,
        },
      })
      .returning();
  },
};
