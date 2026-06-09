/**
 * Populates `sections` and `section_titles` from the `rolls` table.
 *
 * Sections now belong to works (not documents). One canonical section set is
 * created per work, derived from the root (Chinese) document's rolls. Every
 * document — both source and translation — then gets a `section_titles` row
 * for each section, carrying the roll title in that document's language.
 *
 * Mapping:
 *   sections:
 *     - id        reuses the roll UUID from the root sutra
 *     - work_id   resolved via documents.work_id (document.id === sutra.id)
 *     - parent_id null — top-level only; nested sections can be added manually
 *     - key       null — set manually to a language-agnostic identifier later
 *     - order     1, 2, 3… sorted within each sutra by created_at then id
 *
 *   section_titles:
 *     - section_id  the section whose order matches this roll's position
 *     - document_id the document this title belongs to (reuses sutra id)
 *     - title       roll.title
 *     - order       matches section.order
 *
 * Run once: exits early if sections table already contains rows.
 */

import 'dotenv/config';
import { Pool } from '@neondatabase/serverless';
import { count } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-serverless';

import * as schema from '~/drizzle/schema';
import { documentsTable } from '~/drizzle/tables/document';
import { rollsTable } from '~/drizzle/tables/roll';
import { sectionsTable, type CreateSection } from '~/drizzle/tables/section';
import { sectionTitlesTable, type CreateSectionTitle } from '~/drizzle/tables/sectionTitle';
import { sutrasTable } from '~/drizzle/tables/sutra';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

function sortRolls<T extends { createdAt: Date | null; id: string }>(rolls: T[]): T[] {
  return [...rolls].sort((a, b) => {
    const tDiff = (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0);
    return tDiff !== 0 ? tDiff : a.id.localeCompare(b.id);
  });
}

async function main() {
  const [{ value: existingCount }] = await db.select({ value: count() }).from(sectionsTable);
  if (existingCount > 0) {
    console.log(`sections table already has ${existingCount} rows — skipping migration`);
    return;
  }

  const [allSutras, allDocuments, allRolls] = await Promise.all([
    db.select().from(sutrasTable),
    db.select().from(documentsTable),
    db.select().from(rollsTable),
  ]);

  if (allRolls.length === 0) {
    console.log('no rolls found — nothing to migrate');
    return;
  }

  // document.id === sutra.id (established in migration 01)
  const sutraIdToWorkId = new Map(allDocuments.map((d) => [d.id, d.workId]));

  // Group rolls by sutra, sorted deterministically
  const rollsBySutra = allRolls.reduce<Record<string, typeof allRolls>>((acc, roll) => {
    (acc[roll.sutraId] ??= []).push(roll);
    return acc;
  }, {});
  for (const key of Object.keys(rollsBySutra)) {
    rollsBySutra[key] = sortRolls(rollsBySutra[key]);
  }

  const rootSutras = allSutras.filter((s) => s.parentId === null);

  // Build sections from root sutra rolls; record section ids by order per work
  const sections: CreateSection[] = [];
  const workSectionIdsByOrder = new Map<string, string[]>(); // workId → [sectionId at order 1, 2, …]

  for (const sutra of rootSutras) {
    const workId = sutraIdToWorkId.get(sutra.id);
    if (!workId) continue;

    const rolls = rollsBySutra[sutra.id] ?? [];
    const sectionIds: string[] = [];

    rolls.forEach((roll, idx) => {
      sections.push({
        id: roll.id,
        workId,
        parentId: null,
        key: null,
        order: idx + 1,
        createdAt: roll.createdAt,
        updatedAt: roll.updatedAt,
        deletedAt: roll.deletedAt,
        createdBy: roll.createdBy,
        updatedBy: roll.updatedBy,
      });
      sectionIds.push(roll.id);
    });

    workSectionIdsByOrder.set(workId, sectionIds);
  }

  if (sections.length === 0) {
    console.log('no sections to create');
    return;
  }

  await db.insert(sectionsTable).values(sections);
  console.log(`inserted ${sections.length} sections`);

  // Build section_titles for every document (root + translations)
  const sectionTitles: CreateSectionTitle[] = [];

  for (const sutra of allSutras) {
    const documentId = sutra.id;
    const workId = sutraIdToWorkId.get(documentId);
    if (!workId) continue;

    const sectionIds = workSectionIdsByOrder.get(workId);
    if (!sectionIds || sectionIds.length === 0) continue;

    const rolls = rollsBySutra[sutra.id] ?? [];

    rolls.forEach((roll, idx) => {
      const sectionId = sectionIds[idx];
      if (!sectionId) return; // translation has more rolls than source — skip extras

      sectionTitles.push({
        sectionId,
        documentId,
        title: roll.title,
        order: idx + 1,
        createdAt: roll.createdAt,
        updatedAt: roll.updatedAt,
        deletedAt: roll.deletedAt,
        createdBy: roll.createdBy,
        updatedBy: roll.updatedBy,
      });
    });
  }

  if (sectionTitles.length > 0) {
    await db.insert(sectionTitlesTable).values(sectionTitles);
    console.log(`inserted ${sectionTitles.length} section titles`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
