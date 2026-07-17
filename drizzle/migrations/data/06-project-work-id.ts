/**
 * Backfills `projects.work_id` from each project's source document, then enforces
 * NOT NULL once every row is populated.
 *
 * The `work_id` column and its FK are added by the drizzle schema migration
 * (0015_add-work-to-project.sql), but as nullable so it can land on existing
 * rows. This data migration fills the values and then sets NOT NULL:
 *   projects.work_id = documents.work_id
 *   where documents.id = projects.source_document_id
 *
 * Idempotent: only backfills still-null rows, and only sets NOT NULL when no
 * null work_id remains (SET NOT NULL on an already-not-null column is a no-op).
 */

import 'dotenv/config';
import { Pool } from '@neondatabase/serverless';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const backfill = await pool.query(
    `update "projects" p
        set "work_id" = d."work_id"
       from "documents" d
      where p."source_document_id" = d."id"
        and p."work_id" is null`,
  );
  console.log(`backfilled ${backfill.rowCount} project rows`);

  const { rows } = await pool.query(`select count(*)::int as n from "projects" where "work_id" is null`);
  if (rows[0].n > 0) {
    console.warn(
      `WARNING: ${rows[0].n} project(s) still have null work_id (no matching source document). ` +
        `Leaving column nullable — fix these and re-run to enforce NOT NULL.`,
    );
    await pool.end();
    return;
  }

  await pool.query(`alter table "projects" alter column "work_id" set not null`);
  console.log('set projects.work_id NOT NULL');

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
