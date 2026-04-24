/**
 * Populates `contributors` from the `translator` field on the `sutras` table.
 *
 * Mapping:
 *   - one contributor row per sutra (all sutras, including root and translations)
 *   - document_id reuses the sutra UUID (established in migration 01)
 *   - role is always 'translator' — other roles can be added manually post-migration
 *
 * Run once: exits early if contributors table already contains rows.
 */

import 'dotenv/config';
import { Pool } from '@neondatabase/serverless';
import { count } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-serverless';

import * as schema from '~/drizzle/schema';
import { contributorsTable, type CreateContributor } from '~/drizzle/tables/contributor';
import { sutrasTable } from '~/drizzle/tables/sutra';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

async function main() {
  const [{ value: existingCount }] = await db.select({ value: count() }).from(contributorsTable);
  if (existingCount > 0) {
    console.log(`contributors table already has ${existingCount} rows — skipping migration`);
    return;
  }

  const allSutras = await db.select().from(sutrasTable);

  if (allSutras.length === 0) {
    console.log('no sutras found — nothing to migrate');
    return;
  }

  const contributors: CreateContributor[] = allSutras.map((sutra) => ({
    documentId: sutra.id,
    name: sutra.translator,
    role: 'translator',
  }));

  await db.insert(contributorsTable).values(contributors);
  console.log(`inserted ${contributors.length} contributors`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
