/**
 * Populates `works` and `documents` from the existing `sutras` table.
 *
 * Mapping:
 *   - works     ← sutras WHERE parent_id IS NULL (one canonical work per root sutra)
 *   - documents ← all sutras (every sutra becomes a document, including root sutras
 *                 which will become the origin document in the projects table)
 *
 * ID strategy:
 *   - works:     new UUIDs generated here; a sutraId→workId map is built in memory
 *   - documents: reuse the sutra UUID directly
 *   - work_id on a document is resolved via the map:
 *       root sutra  → map[sutra.id]
 *       translation → map[sutra.parentId]
 *
 * passage_key_prefix: cbeta code lowercased (e.g. "T0279" → "t0279").
 *
 * Run once: exits early if works table already contains rows.
 */

import 'dotenv/config';
import { Pool } from '@neondatabase/serverless';
import { count } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-serverless';

import * as schema from '~/drizzle/schema';
import { documentsTable, type CreateDocument } from '~/drizzle/tables/document';
import { sutrasTable } from '~/drizzle/tables/sutra';
import { worksTable, type CreateWork } from '~/drizzle/tables/work';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

async function main() {
  const [{ value: existingWorkCount }] = await db.select({ value: count() }).from(worksTable);
  if (existingWorkCount > 0) {
    console.log(`works table already has ${existingWorkCount} rows — skipping migration`);
    return;
  }

  const allSutras = await db.select().from(sutrasTable);
  const rootSutras = allSutras.filter((s) => s.parentId === null);

  if (rootSutras.length === 0) {
    console.log('no root sutras found — nothing to migrate');
    return;
  }

  // Build sutraId → new workId map using freshly generated UUIDs.
  const sutraIdToWorkId = new Map<string, string>(rootSutras.map((s) => [s.id, crypto.randomUUID()]));

  const works: CreateWork[] = rootSutras.map((sutra) => ({
    id: sutraIdToWorkId.get(sutra.id)!,
    title: sutra.title,
    cbeta: sutra.cbeta,
    category: sutra.category,
    passageKeyPrefix: sutra.cbeta.toLowerCase(),
    createdAt: sutra.createdAt,
    updatedAt: sutra.updatedAt,
    deletedAt: sutra.deletedAt,
    createdBy: sutra.createdBy,
    updatedBy: sutra.updatedBy,
  }));

  const documents: CreateDocument[] = allSutras.map((sutra) => {
    const workId = sutraIdToWorkId.get(sutra.parentId ?? sutra.id);
    if (!workId) {
      throw new Error(
        `sutra ${sutra.id} has parent_id ${sutra.parentId} which is not a root sutra — hierarchy deeper than one level is not supported`,
      );
    }
    return {
      id: sutra.id,
      workId,
      title: sutra.title,
      subtitle: sutra.subtitle ?? null,
      language: sutra.language,
      createdAt: sutra.createdAt,
      updatedAt: sutra.updatedAt,
      deletedAt: sutra.deletedAt,
      createdBy: sutra.createdBy,
      updatedBy: sutra.updatedBy,
    };
  });

  await db.transaction(async (tx) => {
    await tx.insert(worksTable).values(works);
    console.log(`  inserted ${works.length} works`);

    await tx.insert(documentsTable).values(documents);
    console.log(`  inserted ${documents.length} documents`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
