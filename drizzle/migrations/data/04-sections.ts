/**
 * Populates `sections` from the `rolls` table.
 *
 * Mapping:
 *   - id         reuses the roll UUID
 *   - document_id = roll.sutra_id (document IDs reuse sutra IDs from migration 01)
 *   - parent_id  always null — roll.parent_id indicated translation direction, not nesting
 *   - title      from roll.title (roll.subtitle is dropped — it contained chapter names
 *                that were not structurally distinct from the title)
 *   - order      assigned 1, 2, 3... by sorting rolls within each document by
 *                created_at then id; this order is used in passage_key generation
 *                (<prefix>s<section.order>p<paragraph.order>) in migration 05
 *
 * Run once: exits early if sections table already contains rows.
 */

import 'dotenv/config';
import { Pool } from '@neondatabase/serverless';
import { count } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-serverless';

import * as schema from '~/drizzle/schema';
import { rollsTable } from '~/drizzle/tables/roll';
import { sectionsTable, type CreateSection } from '~/drizzle/tables/section';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

async function main() {
  const [{ value: existingCount }] = await db.select({ value: count() }).from(sectionsTable);
  if (existingCount > 0) {
    console.log(`sections table already has ${existingCount} rows — skipping migration`);
    return;
  }

  const allRolls = await db.select().from(rollsTable);

  if (allRolls.length === 0) {
    console.log('no rolls found — nothing to migrate');
    return;
  }

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
      sections.push({
        id: roll.id,
        documentId: roll.sutraId,
        parentId: null,
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
