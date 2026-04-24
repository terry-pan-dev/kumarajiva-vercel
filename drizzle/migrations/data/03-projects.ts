/**
 * Populates `projects` from translation relationships in the `sutras` table.
 *
 * Mapping:
 *   - one project per sutra WHERE parent_id IS NOT NULL
 *   - source_document_id = sutra.parentId (the origin document)
 *   - target_document_id = sutra.id       (the translation document)
 *   - name, finish, team_id, and audit fields are taken from the target sutra
 *
 * Note: root sutras with no translations produce no project row. The finish
 * and team_id fields from those sutras are not migrated — if standalone works
 * need project tracking, create project rows manually after this migration.
 *
 * Run once: exits early if projects table already contains rows.
 */

import 'dotenv/config';
import { Pool } from '@neondatabase/serverless';
import { count, isNotNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-serverless';

import * as schema from '~/drizzle/schema';
import { projectsTable, type CreateProject } from '~/drizzle/tables/project';
import { sutrasTable } from '~/drizzle/tables/sutra';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

async function main() {
  const [{ value: existingCount }] = await db.select({ value: count() }).from(projectsTable);
  if (existingCount > 0) {
    console.log(`projects table already has ${existingCount} rows — skipping migration`);
    return;
  }

  const translationSutras = await db.select().from(sutrasTable).where(isNotNull(sutrasTable.parentId));

  if (translationSutras.length === 0) {
    console.log('no translation sutras found — nothing to migrate');
    return;
  }

  const projects: CreateProject[] = translationSutras.map((sutra) => ({
    name: sutra.title,
    sourceDocumentId: sutra.parentId!,
    targetDocumentId: sutra.id,
    finish: sutra.finish,
    teamId: sutra.teamId,
    createdAt: sutra.createdAt,
    updatedAt: sutra.updatedAt,
    deletedAt: sutra.deletedAt,
    createdBy: sutra.createdBy,
    updatedBy: sutra.updatedBy,
  }));

  await db.insert(projectsTable).values(projects);
  console.log(`inserted ${projects.length} projects`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
