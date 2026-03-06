/**
 * =============================================================================
 * file.server.ts  —  SERVER-ONLY
 * =============================================================================
 *
 * DB-backed helpers for file import/export. Only import this from:
 *   - Remix loaders  (loader function in route files)
 *   - Remix actions  (action function in route files)
 *   - Other *.server.ts files
 *
 * Never import this from component code or any file without a .server.ts
 * suffix — it will pull Drizzle/DB modules into the client bundle.
 *
 * Client-safe types and parsing utilities live in:
 *   ~/services/file.service.ts
 */

import 'dotenv/config';
import { eq, inArray } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

import { paragraphsTable, referencesTable } from '~/drizzle/schema';
import { getDb } from '~/lib/db.server';
import { DEFAULT_ORIGIN_LANG, PREVIEW_LIMIT } from '~/utils/constants';

import {
  type ExcelTranslationRow,
  type ExistingDataPreview,
  type ImportOptions,
  type ImportResult,
} from './file.service';
import { readParagraphsByRollIdForLanguage } from './paragraph.service';

export const db = getDb();

/**
 * Delete all paragraphs and references for a roll, then insert fresh rows from
 * the imported file.  Runs the deletes in the correct FK order:
 *   1. references (FK → paragraphs)
 *   2. child paragraphs (parentId → paragraphs)
 *   3. parent/origin paragraphs
 * Then inserts origin paragraphs followed by translation children.
 */
export async function replaceRollData(rows: ExcelTranslationRow[], options: ImportOptions): Promise<ImportResult> {
  const { rollId, originalLanguage, translationLanguage, userId } = options;

  // Build insert data before the transaction — pure computation, no DB I/O.
  const originParagraphs = rows.map((row, idx) => ({
    id: uuidv4(),
    rollId,
    number: idx + 1,
    order: String(idx + 1),
    language: originalLanguage as (typeof paragraphsTable.language.enumValues)[number],
    content: row.origin,
    createdBy: userId,
    updatedBy: userId,
  }));

  const targetParagraphs = rows
    .map((row, idx) => {
      if (!row.target) return null;
      return {
        id: uuidv4(),
        rollId,
        parentId: originParagraphs[idx].id,
        number: idx + 1,
        order: String(idx + 1),
        language: translationLanguage as (typeof paragraphsTable.language.enumValues)[number],
        content: row.target,
        createdBy: userId,
        updatedBy: userId,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  try {
    const deletedCount = await db.transaction(async (tx) => {
      // ── 1. Load all existing paragraphs for this roll ────────────────────
      const existing = await tx.query.paragraphsTable.findMany({
        where: eq(paragraphsTable.rollId, rollId),
      });

      if (existing.length > 0) {
        const existingIds = existing.map((p) => p.id);

        // ── 2. Delete references ────────────────────────────────────────────
        await tx.delete(referencesTable).where(inArray(referencesTable.paragraphId, existingIds));

        // ── 3. Delete child paragraphs before parents (FK constraint) ───────
        const childIds = existing.filter((p) => p.parentId != null).map((p) => p.id);
        if (childIds.length > 0) {
          await tx.delete(paragraphsTable).where(inArray(paragraphsTable.id, childIds));
        }

        // ── 4. Delete parent/origin paragraphs ─────────────────────────────
        const parentIds = existing.filter((p) => p.parentId == null).map((p) => p.id);
        if (parentIds.length > 0) {
          await tx.delete(paragraphsTable).where(inArray(paragraphsTable.id, parentIds));
        }
      }

      // ── 5. Insert new origin paragraphs ──────────────────────────────────
      if (originParagraphs.length > 0) {
        await tx.insert(paragraphsTable).values(originParagraphs);
      }

      // ── 6. Insert target/translation paragraphs ───────────────────────────
      if (targetParagraphs.length > 0) {
        await tx.insert(paragraphsTable).values(targetParagraphs);
      }

      return existing.filter((p) => p.parentId == null).length;
    });

    return {
      success: true,
      inserted: rows.length,
      deleted: deletedCount,
      message: `Replaced ${deletedCount} existing paragraph(s) with ${rows.length} new paragraph(s) (${targetParagraphs.length} with translations).`,
    };
  } catch (error) {
    console.error('replaceRollData error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      message: `Failed to replace data: ${errorMessage}`,
      errors: [errorMessage],
    };
  }
}

/**
 * Fetch a preview of the existing data for a roll from the database.
 *
 * Returns a limited slice of paragraphs (up to PREVIEW_LIMIT) plus
 * aggregate counts so the UI can show what will be replaced before the
 * user confirms an import.
 */
export async function getExistingDataPreviewForRollId(rollId: string): Promise<ExistingDataPreview> {
  const databaseParagraphs = await readParagraphsByRollIdForLanguage({ rollId, language: DEFAULT_ORIGIN_LANG });

  const totalParagraphs = databaseParagraphs.length;
  const totalReferences = databaseParagraphs.reduce((sum, p) => sum + (p.references?.length || 0), 0);

  return {
    paragraphs: databaseParagraphs.slice(0, PREVIEW_LIMIT).map((p) => ({
      id: p.id,
      order: p.order,
      origin: p.origin,
      targetId: p.targetId,
      target: p.target,
      references: (p.references || []).map((r) => ({
        id: r.id,
        order: r.order,
        sutraName: r.sutraName ?? '',
        content: r.content ?? '',
      })),
    })),
    totalParagraphs,
    totalReferences,
  };
}
