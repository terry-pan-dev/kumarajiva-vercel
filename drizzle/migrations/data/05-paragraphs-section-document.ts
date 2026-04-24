/**
 * Populates section_id, document_id, and passage_key on the existing paragraphs table.
 *
 * Since section IDs reuse roll IDs (migration 04), section_id = roll_id for every paragraph.
 * document_id is taken from the section. passage_key is generated as:
 *   <work.passage_key_prefix>s<section.order>p<paragraph.number>
 *
 * Run once: exits early if any paragraph already has a section_id set.
 */

import 'dotenv/config';
import { sql as vercelSql } from '@vercel/postgres';
import { eq, isNotNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/vercel-postgres';

import * as schema from '~/drizzle/schema';
import { documentsTable } from '~/drizzle/tables/document';
import { paragraphsTable } from '~/drizzle/tables/paragraph';
import { sectionsTable } from '~/drizzle/tables/section';
import { worksTable } from '~/drizzle/tables/work';

const db = drizzle(vercelSql, { schema });

async function main() {
  const alreadyDone = await db
    .select({ sectionId: paragraphsTable.sectionId })
    .from(paragraphsTable)
    .where(isNotNull(paragraphsTable.sectionId))
    .limit(1);

  if (alreadyDone.length > 0) {
    console.log('paragraphs already have section_id set — skipping migration');
    return;
  }

  const [allParagraphs, allSections, allDocuments, allWorks] = await Promise.all([
    db.select().from(paragraphsTable),
    db.select().from(sectionsTable),
    db.select().from(documentsTable),
    db.select().from(worksTable),
  ]);

  const sectionById = new Map(allSections.map((s) => [s.id, s]));
  const documentById = new Map(allDocuments.map((d) => [d.id, d]));
  const workById = new Map(allWorks.map((w) => [w.id, w]));

  let updated = 0;
  let skipped = 0;

  for (const paragraph of allParagraphs) {
    const section = sectionById.get(paragraph.rollId);
    if (!section) {
      console.warn(`  no section for paragraph ${paragraph.id} (roll_id ${paragraph.rollId}) — skipping`);
      skipped++;
      continue;
    }

    const document = documentById.get(section.documentId);
    if (!document) {
      console.warn(`  no document for section ${section.id} — skipping paragraph ${paragraph.id}`);
      skipped++;
      continue;
    }

    const work = workById.get(document.workId);
    if (!work) {
      console.warn(`  no work for document ${document.id} — skipping paragraph ${paragraph.id}`);
      skipped++;
      continue;
    }

    await db
      .update(paragraphsTable)
      .set({
        sectionId: section.id,
        documentId: document.id,
        passageKey: `${work.passageKeyPrefix}s${section.order}p${paragraph.number}`,
      })
      .where(eq(paragraphsTable.id, paragraph.id));

    updated++;
  }

  console.log(`updated ${updated} paragraphs, skipped ${skipped}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
