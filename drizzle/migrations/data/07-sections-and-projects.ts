/**
 * Populates `projects` and `sections` for the reverted, document-based schema.
 * This is the single data migration that brings sutra/roll data into the current
 * project and section tables (both of which now carry a NOT NULL work_id). The
 * schema migration (0016) empties both tables and enforces the NOT NULL shape, so
 * every row inserted here provides work_id up front — no backfill step is needed.
 *
 * projects (one per translation sutra, i.e. parent_id IS NOT NULL):
 *   - name        from the target (translation) sutra
 *   - work_id     resolved via documents.work_id (document.id === sutra.id)
 *   - source_document_id = sutra.parentId (the origin document)
 *   - target_document_id = sutra.id       (the translation document)
 *   - finish, team_id, audit fields from the target sutra
 *   Root sutras with no translations produce no project row.
 *
 * sections (from the `rolls` table):
 *   - id          reuses the roll UUID
 *   - work_id     resolved via documents.work_id (document.id === sutra.id)
 *   - document_id = roll.sutra_id (document IDs reuse sutra IDs from migration 01)
 *   - parent_id   reuses roll.parent_id
 *   - title       from roll.title (roll.subtitle is dropped — it contained chapter
 *                 names that were not structurally distinct from the title)
 *   - order       assigned 1, 2, 3... by sorting rolls within each document by
 *                 created_at then id
 *
 * Each step is run-once: it exits early if its table already contains rows.
 */

import 'dotenv/config';
import { Pool } from '@neondatabase/serverless';
import { count, isNotNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-serverless';

import * as schema from '~/drizzle/schema';
import { documentsTable } from '~/drizzle/tables/document';
import { projectsTable, type CreateProject } from '~/drizzle/tables/project';
import { rollsTable } from '~/drizzle/tables/roll';
import { sectionsTable, type CreateSection } from '~/drizzle/tables/section';
import { sutrasTable } from '~/drizzle/tables/sutra';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

/** document.id === sutra.id (established in migration 01) → work_id */
async function loadDocumentIdToWorkId() {
  const documents = await db.select({ id: documentsTable.id, workId: documentsTable.workId }).from(documentsTable);
  return new Map(documents.map((d) => [d.id, d.workId]));
}

async function populateProjects() {
  const [{ value: existingCount }] = await db.select({ value: count() }).from(projectsTable);
  if (existingCount > 0) {
    console.log(`projects table already has ${existingCount} rows — skipping project population`);
    return;
  }

  const translationSutras = await db.select().from(sutrasTable).where(isNotNull(sutrasTable.parentId));
  if (translationSutras.length === 0) {
    console.log('no translation sutras found — no projects to migrate');
    return;
  }

  const documentIdToWorkId = await loadDocumentIdToWorkId();

  const projects: CreateProject[] = translationSutras.map((sutra) => {
    const workId = documentIdToWorkId.get(sutra.id);
    if (!workId) {
      throw new Error(`no document/work found for sutra ${sutra.id} — run migration 01 first`);
    }
    return {
      name: sutra.title,
      workId,
      sourceDocumentId: sutra.parentId!,
      targetDocumentId: sutra.id,
      finish: sutra.finish,
      teamId: sutra.teamId,
      createdAt: sutra.createdAt,
      updatedAt: sutra.updatedAt,
      deletedAt: sutra.deletedAt,
      createdBy: sutra.createdBy,
      updatedBy: sutra.updatedBy,
    };
  });

  await db.insert(projectsTable).values(projects);
  console.log(`inserted ${projects.length} projects`);
}

async function populateSections() {
  const [{ value: existingCount }] = await db.select({ value: count() }).from(sectionsTable);
  if (existingCount > 0) {
    console.log(`sections table already has ${existingCount} rows — skipping section population`);
    return;
  }

  const allRolls = await db.select().from(rollsTable);
  if (allRolls.length === 0) {
    console.log('no rolls found — no sections to migrate');
    return;
  }

  const documentIdToWorkId = await loadDocumentIdToWorkId();

  // Group rolls by document (sutra_id), then sort within each group by
  // created_at + id to get a stable, deterministic order.
  const rollsByDocument = allRolls.reduce<Record<string, typeof allRolls>>((acc, roll) => {
    (acc[roll.sutraId] ??= []).push(roll);
    return acc;
  }, {});

  const sections: CreateSection[] = [];
  for (const [, rolls] of Object.entries(rollsByDocument)) {
    const sorted = [...rolls].sort((a, b) => {
      const tDiff = (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0);
      return tDiff !== 0 ? tDiff : a.id.localeCompare(b.id);
    });

    sorted.forEach((roll, index) => {
      const workId = documentIdToWorkId.get(roll.sutraId);
      if (!workId) {
        throw new Error(`no document/work found for roll ${roll.id} (sutra ${roll.sutraId}) — run migration 01 first`);
      }
      sections.push({
        id: roll.id,
        workId,
        documentId: roll.sutraId,
        title: roll.title,
        order: index + 1,
        createdAt: roll.createdAt,
        updatedAt: roll.updatedAt,
        deletedAt: roll.deletedAt,
        createdBy: roll.createdBy,
        updatedBy: roll.updatedBy,
      });
    });
  }

  await db.insert(sectionsTable).values(sections);
  console.log(`inserted ${sections.length} sections`);
}

async function main() {
  await populateProjects();
  await populateSections();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
